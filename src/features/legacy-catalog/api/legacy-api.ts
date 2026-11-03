import { api, normalizePage, type Paginated } from '@/lib/api';
import type { BookingLink, CatalogItem, CatalogQuery, Experience, ExperienceQuery } from './types';

export const legacyApi = {
  items: async (q: CatalogQuery): Promise<Paginated<CatalogItem>> =>
    normalizePage(await api.get('catalog/items', { query: { ...q } })),
  createItem: (item: CatalogItem) => api.post<CatalogItem>('catalog/items', item),
  updateItem: (id: number, patch: Partial<CatalogItem>) => api.patch<CatalogItem>(`catalog/items/${id}`, patch),
  deleteItem: (id: number) => api.delete<void>(`catalog/items/${id}`),

  experiences: async (q: ExperienceQuery): Promise<Paginated<Experience>> =>
    normalizePage(await api.get('experiences', { query: { ...q } })),
  experienceMeta: () => api.get<{ filters: unknown; labels: Record<string, string> }>('experiences/meta'),
  createExperience: (x: Experience) => api.post<Experience>('experiences', x),
  updateExperience: (id: string, patch: Partial<Experience>) =>
    api.patch<Experience>(`experiences/${encodeURIComponent(id)}`, patch),
  deleteExperience: (id: string) => api.delete<void>(`experiences/${encodeURIComponent(id)}`),

  bookingLink: (cardId: string) => api.get<BookingLink>(`ideas/${encodeURIComponent(cardId)}/booking-link`),
  setBookingLink: (cardId: string, body: { url: string; venue: string | null; paid: boolean }) =>
    api.put<BookingLink>(`ideas/${encodeURIComponent(cardId)}/booking-link`, body),
  removeBookingLink: (cardId: string) => api.delete<void>(`ideas/${encodeURIComponent(cardId)}/booking-link`),
};
