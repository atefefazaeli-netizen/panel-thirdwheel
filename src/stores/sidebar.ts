import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SidebarState {
  /** Desktop: expanded (true) or icon rail (false). */
  open: boolean;
  /** Phone and tablet: the sheet is showing. */
  openMobile: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      open: true,
      openMobile: false,
      setOpen: (open) => set({ open }),
      setOpenMobile: (openMobile) => set({ openMobile }),
    }),
    {
      name: 'tw-panel-sidebar',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ open: s.open }),
    },
  ),
);
