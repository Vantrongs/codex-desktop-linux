#define _GNU_SOURCE

#include <elf.h>
#include <errno.h>
#include <link.h>
#include <stdbool.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>

#include "hotpatch-spec.h"

typedef void (*LayoutSelectionCommitFn)(void* layout_selection);
typedef void* (*FrameSelectionGetDocumentFn)(void* frame_selection);
typedef int (*DocumentCalculateStyleAndLayoutTreeUpdateFn)(void* document);
typedef void* (*DocumentViewFn)(void* document);
typedef bool (*LocalFrameViewNeedsLayoutFn)(void* frame_view);

struct BaseLocation {
  const char* function_name;
  const char* file_name;
  int line_number;
  int padding;
  const void* program_counter;
};

typedef void (*LocalFrameViewScheduleAnimationFn)(
    void* frame_view,
    int64_t delay_microseconds,
    const struct BaseLocation* location,
    bool do_not_throttle);

struct MainModule {
  uintptr_t base;
  const ElfW(Phdr)* program_headers;
  ElfW(Half) program_header_count;
  bool build_id_matches;
};

static uintptr_t g_electron_base;
static LayoutSelectionCommitFn g_original_commit;
static atomic_bool g_force_dirty_once_for_test;
static bool g_log_enabled;
static atomic_bool g_deferred_logged;

static void write_message(const char* message) {
  size_t length = strlen(message);
  while (length > 0) {
    ssize_t written = write(STDERR_FILENO, message, length);
    if (written > 0) {
      message += written;
      length -= (size_t)written;
      continue;
    }
    if (written < 0 && errno == EINTR) continue;
    break;
  }
}

static uintptr_t align_note_size(uintptr_t value) {
  return (value + 3u) & ~(uintptr_t)3u;
}

static bool module_has_expected_build_id(const struct dl_phdr_info* info) {
  for (ElfW(Half) index = 0; index < info->dlpi_phnum; ++index) {
    const ElfW(Phdr)* header = &info->dlpi_phdr[index];
    if (header->p_type != PT_NOTE) continue;

    const uint8_t* cursor =
        (const uint8_t*)(info->dlpi_addr + header->p_vaddr);
    const uint8_t* end = cursor + header->p_memsz;
    while ((size_t)(end - cursor) >= sizeof(ElfW(Nhdr))) {
      const ElfW(Nhdr)* note = (const ElfW(Nhdr)*)cursor;
      cursor += sizeof(ElfW(Nhdr));
      uintptr_t name_size = align_note_size(note->n_namesz);
      uintptr_t description_size = align_note_size(note->n_descsz);
      if (name_size > (uintptr_t)(end - cursor)) return false;
      const uint8_t* name = cursor;
      cursor += name_size;
      if (description_size > (uintptr_t)(end - cursor)) return false;
      const uint8_t* description = cursor;
      cursor += description_size;
      if (note->n_type == NT_GNU_BUILD_ID && note->n_namesz == 4 &&
          memcmp(name, "GNU\0", 4) == 0 &&
          note->n_descsz == sizeof(kCodexHotpatchExpectedBuildId)) {
        return memcmp(description, kCodexHotpatchExpectedBuildId,
                      sizeof(kCodexHotpatchExpectedBuildId)) == 0;
      }
    }
  }
  return false;
}

static int find_main_module(struct dl_phdr_info* info,
                            size_t size,
                            void* data) {
  (void)size;
  if (info->dlpi_name != NULL && info->dlpi_name[0] != '\0') return 0;
  struct MainModule* module = data;
  module->base = (uintptr_t)info->dlpi_addr;
  module->program_headers = info->dlpi_phdr;
  module->program_header_count = info->dlpi_phnum;
  module->build_id_matches = module_has_expected_build_id(info);
  return 1;
}

static bool signature_matches(uintptr_t rva,
                              const uint8_t* signature,
                              size_t signature_size) {
  return memcmp((const void*)(g_electron_base + rva), signature,
                signature_size) == 0;
}

static bool all_signatures_match(void) {
  return signature_matches(
             CODEX_HOTPATCH_LAYOUT_SELECTION_COMMIT_RVA,
             kCodexHotpatchLayoutSelectionCommitSignature,
             sizeof(kCodexHotpatchLayoutSelectionCommitSignature)) &&
         signature_matches(
             CODEX_HOTPATCH_FRAME_SELECTION_GET_DOCUMENT_RVA,
             kCodexHotpatchFrameSelectionGetDocumentSignature,
             sizeof(kCodexHotpatchFrameSelectionGetDocumentSignature)) &&
         signature_matches(
             CODEX_HOTPATCH_DOCUMENT_CALCULATE_STYLE_AND_LAYOUT_TREE_UPDATE_RVA,
             kCodexHotpatchDocumentCalculateStyleAndLayoutTreeUpdateSignature,
             sizeof(
                 kCodexHotpatchDocumentCalculateStyleAndLayoutTreeUpdateSignature)) &&
         signature_matches(
             CODEX_HOTPATCH_DOCUMENT_VIEW_RVA,
             kCodexHotpatchDocumentViewSignature,
             sizeof(kCodexHotpatchDocumentViewSignature)) &&
         signature_matches(
             CODEX_HOTPATCH_LOCAL_FRAME_VIEW_NEEDS_LAYOUT_RVA,
             kCodexHotpatchLocalFrameViewNeedsLayoutSignature,
             sizeof(kCodexHotpatchLocalFrameViewNeedsLayoutSignature)) &&
         signature_matches(
             CODEX_HOTPATCH_LOCAL_FRAME_VIEW_SCHEDULE_ANIMATION_RVA,
             kCodexHotpatchLocalFrameViewScheduleAnimationSignature,
             sizeof(kCodexHotpatchLocalFrameViewScheduleAnimationSignature));
}

static void* decode_cppgc_pointer(const void* owner, size_t offset) {
  int32_t compressed = 0;
  memcpy(&compressed, (const uint8_t*)owner + offset, sizeof(compressed));
  uintptr_t cage_base = *(const uintptr_t*)(
      g_electron_base + CODEX_HOTPATCH_CPPGC_CAGE_BASE_GLOBAL_RVA);
  uintptr_t shifted = (uintptr_t)(intptr_t)compressed;
  shifted <<= 3;
  return (void*)(shifted & cage_base);
}

static bool document_is_dirty(void* document, void** frame_view_out) {
  DocumentCalculateStyleAndLayoutTreeUpdateFn calculate_update =
      (DocumentCalculateStyleAndLayoutTreeUpdateFn)(
          g_electron_base +
          CODEX_HOTPATCH_DOCUMENT_CALCULATE_STYLE_AND_LAYOUT_TREE_UPDATE_RVA);
  DocumentViewFn get_view =
      (DocumentViewFn)(g_electron_base + CODEX_HOTPATCH_DOCUMENT_VIEW_RVA);
  LocalFrameViewNeedsLayoutFn needs_layout =
      (LocalFrameViewNeedsLayoutFn)(
          g_electron_base +
          CODEX_HOTPATCH_LOCAL_FRAME_VIEW_NEEDS_LAYOUT_RVA);

  void* frame_view = get_view(document);
  *frame_view_out = frame_view;
  return calculate_update(document) != 0 ||
         (frame_view != NULL && needs_layout(frame_view));
}

static void schedule_next_frame(void* frame_view) {
  if (frame_view == NULL) return;
  LocalFrameViewScheduleAnimationFn schedule_animation =
      (LocalFrameViewScheduleAnimationFn)(
          g_electron_base +
          CODEX_HOTPATCH_LOCAL_FRAME_VIEW_SCHEDULE_ANIMATION_RVA);
  static const struct BaseLocation location = {
      .function_name = "codex_linux_layout_selection_hotpatch",
      .file_name = "electron-layout-selection-hotpatch/hotpatch.c",
      .line_number = 1,
      .padding = 0,
      .program_counter = NULL,
  };
  schedule_animation(frame_view, 0, &location, false);
}

__attribute__((noinline)) static void patched_layout_selection_commit(
    void* layout_selection) {
  uint8_t flags = *((const uint8_t*)layout_selection + 4);
  if ((flags & 1u) == 0) return;

  void* frame_selection = decode_cppgc_pointer(layout_selection, 0);
  FrameSelectionGetDocumentFn get_document =
      (FrameSelectionGetDocumentFn)(
          g_electron_base +
          CODEX_HOTPATCH_FRAME_SELECTION_GET_DOCUMENT_RVA);
  void* document = get_document(frame_selection);
  void* frame_view = NULL;
  bool force_dirty = atomic_exchange_explicit(
      &g_force_dirty_once_for_test, false, memory_order_relaxed);

  if (force_dirty || document_is_dirty(document, &frame_view)) {
    if (frame_view == NULL) {
      DocumentViewFn get_view =
          (DocumentViewFn)(
              g_electron_base + CODEX_HOTPATCH_DOCUMENT_VIEW_RVA);
      frame_view = get_view(document);
    }
    schedule_next_frame(frame_view);
    if (g_log_enabled &&
        !atomic_exchange_explicit(&g_deferred_logged, true,
                                  memory_order_relaxed)) {
      write_message(
          "codex-blink-layout-selection-hotpatch: deferred dirty selection\n");
    }
    return;
  }

  g_original_commit(layout_selection);
}

static bool install_trampoline(uint8_t* target) {
  const long raw_page_size = sysconf(_SC_PAGESIZE);
  if (raw_page_size <= 0) return false;
  const size_t page_size = (size_t)raw_page_size;
  uint8_t* trampoline = mmap(NULL, page_size, PROT_READ | PROT_WRITE,
                             MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  if (trampoline == MAP_FAILED) return false;

  const size_t prologue_size =
      sizeof(kCodexHotpatchLayoutSelectionCommitSignature);
  memcpy(trampoline, kCodexHotpatchLayoutSelectionCommitSignature,
         prologue_size);
  size_t cursor = prologue_size;
  trampoline[cursor++] = 0x48;
  trampoline[cursor++] = 0xb8;
  uintptr_t continuation = (uintptr_t)target + prologue_size;
  memcpy(trampoline + cursor, &continuation, sizeof(continuation));
  cursor += sizeof(continuation);
  trampoline[cursor++] = 0xff;
  trampoline[cursor++] = 0xe0;

  if (mprotect(trampoline, page_size, PROT_READ | PROT_EXEC) != 0) {
    munmap(trampoline, page_size);
    return false;
  }
  __builtin___clear_cache((char*)trampoline, (char*)trampoline + cursor);
  g_original_commit = (LayoutSelectionCommitFn)trampoline;
  return true;
}

static bool install_patch(void) {
  struct MainModule module = {0};
  dl_iterate_phdr(find_main_module, &module);
  if (!module.build_id_matches) return false;
  g_electron_base = module.base;
  if (!all_signatures_match()) {
    write_message(
        "codex-blink-layout-selection-hotpatch: Electron signature mismatch; patch disabled\n");
    return false;
  }

  uint8_t* target = (uint8_t*)(
      g_electron_base + CODEX_HOTPATCH_LAYOUT_SELECTION_COMMIT_RVA);
  if (!install_trampoline(target)) return false;

  const long raw_page_size = sysconf(_SC_PAGESIZE);
  if (raw_page_size <= 0) return false;
  const size_t page_size = (size_t)raw_page_size;
  uintptr_t page_start = (uintptr_t)target & ~(page_size - 1);
  if (mprotect((void*)page_start, page_size,
               PROT_READ | PROT_WRITE | PROT_EXEC) != 0) {
    return false;
  }

  uint8_t jump[sizeof(kCodexHotpatchLayoutSelectionCommitSignature)] = {
      0x48, 0xb8};
  uintptr_t hook = (uintptr_t)&patched_layout_selection_commit;
  memcpy(jump + 2, &hook, sizeof(hook));
  jump[10] = 0xff;
  jump[11] = 0xe0;
  memcpy(target, jump, sizeof(jump));
  __builtin___clear_cache((char*)target, (char*)target + sizeof(jump));
  if (mprotect((void*)page_start, page_size, PROT_READ | PROT_EXEC) != 0) {
    write_message(
        "codex-blink-layout-selection-hotpatch: failed to restore executable page protection\n");
    _exit(127);
  }
  return true;
}

__attribute__((constructor)) static void initialize_hotpatch(void) {
  atomic_init(
      &g_force_dirty_once_for_test,
      getenv("CODEX_BLINK_LAYOUT_SELECTION_TEST_FORCE_DIRTY_ONCE") != NULL);
  atomic_init(&g_deferred_logged, false);
  g_log_enabled =
      getenv("CODEX_BLINK_LAYOUT_SELECTION_PATCH_LOG") != NULL;
  if (!install_patch()) return;
  if (g_log_enabled) {
    write_message(
        "codex-blink-layout-selection-hotpatch: installed for Electron "
        CODEX_HOTPATCH_ELECTRON_VERSION "\n");
  }
}
