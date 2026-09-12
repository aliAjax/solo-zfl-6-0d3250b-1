import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WritingSystemStore, Radical, Lexeme, CompositionLayout, HistoricalStage } from '@/types';
import { generateId } from '@/utils/glyphUtils';
import { MOCK_STAGES, MOCK_RADICALS, MOCK_LEXEMES } from '@/utils/mockData';

const STORAGE_KEY = 'fictional-writing-system-v1';

/** 按 order 升序后重排为连续的 0..n-1，消除顺序重复或缺口 */
const normalizeStages = (stages: HistoricalStage[]): HistoricalStage[] =>
  [...stages]
    .sort((a, b) => a.order - b.order)
    .map((st, i) => ({ ...st, order: i }));

const getInitialState = () => ({
  stages: MOCK_STAGES,
  radicals: MOCK_RADICALS,
  lexemes: MOCK_LEXEMES,
  selectedRadicalId: null as string | null,
  selectedStageId: MOCK_STAGES[MOCK_STAGES.length - 1]?.id || null,
  composingRadicalIds: [] as string[],
  composingLayout: 'horizontal' as CompositionLayout,
});

export const useWritingSystemStore = create<WritingSystemStore>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      addStage: (s) =>
        set((state) => {
          const normalized = normalizeStages(state.stages);
          const pos = Math.max(0, Math.min(normalized.length, Math.round(s.order) || 0));
          const newStage: HistoricalStage = { ...s, order: pos, id: generateId() };
          const next = [...normalized.slice(0, pos), newStage, ...normalized.slice(pos)];
          return { stages: next.map((st, i) => ({ ...st, order: i })) };
        }),

      updateStage: (id, patch) =>
        set((state) => ({
          stages: state.stages.map((st) => (st.id === id ? { ...st, ...patch } : st)),
        })),

      removeStage: (id) =>
        set((state) => {
          const normalized = normalizeStages(state.stages);
          const idx = normalized.findIndex((st) => st.id === id);
          const stages = normalized.filter((st) => st.id !== id);
          const selectedStageId =
            state.selectedStageId === id
              ? stages[Math.min(Math.max(idx, 0), stages.length - 1)]?.id ?? null
              : state.selectedStageId;
          return {
            stages,
            radicals: state.radicals.map((r) => ({
              ...r,
              variants: r.variants.filter((v) => v.stageId !== id),
            })),
            selectedStageId,
          };
        }),

      reorderStage: (id, toIndex) =>
        set((state) => {
          const normalized = normalizeStages(state.stages);
          const from = normalized.findIndex((st) => st.id === id);
          if (from < 0) return state;
          const target = Math.max(0, Math.min(normalized.length - 1, Math.round(toIndex)));
          if (target === from) return state;
          const [moved] = normalized.splice(from, 1);
          normalized.splice(target, 0, moved);
          return { stages: normalized.map((st, i) => ({ ...st, order: i })) };
        }),

      addRadical: (r) => {
        const id = generateId();
        const now = Date.now();
        const newRadical: Radical = {
          ...r,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          radicals: [...state.radicals, newRadical],
        }));
        return id;
      },

      updateRadical: (id, patch) =>
        set((state) => ({
          radicals: state.radicals.map((r) =>
            r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r
          ),
        })),

      removeRadical: (id) =>
        set((state) => ({
          radicals: state.radicals.filter((r) => r.id !== id),
          lexemes: state.lexemes.map((l) => ({
            ...l,
            radicalIds: l.radicalIds.filter((rid) => rid !== id),
          })),
          selectedRadicalId: state.selectedRadicalId === id ? null : state.selectedRadicalId,
          composingRadicalIds: state.composingRadicalIds.filter((rid) => rid !== id),
        })),

      addLexeme: (l) => {
        const id = generateId();
        const newLexeme: Lexeme = {
          ...l,
          id,
          createdAt: Date.now(),
        };
        set((state) => ({
          lexemes: [...state.lexemes, newLexeme],
        }));
        return id;
      },

      updateLexeme: (id, patch) =>
        set((state) => ({
          lexemes: state.lexemes.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),

      removeLexeme: (id) =>
        set((state) => ({
          lexemes: state.lexemes.filter((l) => l.id !== id),
        })),

      selectRadical: (id) => set({ selectedRadicalId: id }),
      selectStage: (id) => set({ selectedStageId: id }),

      addToComposer: (radicalId) =>
        set((state) => ({
          composingRadicalIds: [...state.composingRadicalIds, radicalId],
        })),

      removeFromComposer: (index) =>
        set((state) => ({
          composingRadicalIds: state.composingRadicalIds.filter((_, i) => i !== index),
        })),

      clearComposer: () => set({ composingRadicalIds: [] }),

      moveInComposer: (fromIndex, toIndex) =>
        set((state) => {
          const arr = [...state.composingRadicalIds];
          if (fromIndex < 0 || fromIndex >= arr.length) return state;
          if (toIndex < 0 || toIndex >= arr.length) return state;
          const [moved] = arr.splice(fromIndex, 1);
          arr.splice(toIndex, 0, moved);
          return { composingRadicalIds: arr };
        }),

      setComposingLayout: (layout) => set({ composingLayout: layout }),

      exportData: () => {
        const state = get();
        return JSON.stringify(
          {
            stages: state.stages,
            radicals: state.radicals,
            lexemes: state.lexemes,
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        );
      },

      importData: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed.stages || !parsed.radicals || !parsed.lexemes) {
            throw new Error('Invalid data format');
          }
          set({
            stages: parsed.stages,
            radicals: parsed.radicals,
            lexemes: parsed.lexemes,
            selectedRadicalId: null,
            selectedStageId: parsed.stages[parsed.stages.length - 1]?.id || null,
            composingRadicalIds: [],
          });
        } catch (e) {
          console.error('Import failed:', e);
          throw e;
        }
      },

      resetAll: () => set(getInitialState()),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        stages: state.stages,
        radicals: state.radicals,
        lexemes: state.lexemes,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.selectedStageId && state.stages.length > 0) {
            state.selectedStageId = state.stages[state.stages.length - 1].id;
          }
        }
      },
    }
  )
);
