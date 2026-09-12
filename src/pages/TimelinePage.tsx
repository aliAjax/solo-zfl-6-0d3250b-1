import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  BookMarked,
  Layers,
  Settings2,
  Plus,
  Check,
  X,
  Edit3,
  Trash2,
  Play,
  Pause,
  Square,
} from 'lucide-react';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { ShapeRenderer, GlyphRenderer } from '@/components/GlyphRenderer';
import { getVariantForStage } from '@/utils/glyphUtils';
import type { HistoricalStage } from '@/types';

const STAGE_COLOR_PALETTE = ['#8B5A2B', '#6B8E6B', '#556B8B', '#3E2723', '#5D7A6F', '#9C6B3A', '#7A4E5E', '#4F6B5A'];

type StageDraft = {
  name: string;
  order: number;
  description: string;
  color: string;
};

const emptyDraft = (nextPos: number): StageDraft => ({
  name: '',
  order: nextPos,
  description: '',
  color: STAGE_COLOR_PALETTE[0],
});

export const TimelinePage: React.FC = () => {
  const stages = useWritingSystemStore((s) => s.stages);
  const radicals = useWritingSystemStore((s) => s.radicals);
  const selectedStageId = useWritingSystemStore((s) => s.selectedStageId);
  const selectedRadicalId = useWritingSystemStore((s) => s.selectedRadicalId);
  const selectStage = useWritingSystemStore((s) => s.selectStage);
  const selectRadical = useWritingSystemStore((s) => s.selectRadical);
  const addStage = useWritingSystemStore((s) => s.addStage);
  const updateStage = useWritingSystemStore((s) => s.updateStage);
  const removeStage = useWritingSystemStore((s) => s.removeStage);
  const reorderStage = useWritingSystemStore((s) => s.reorderStage);

  const [manageOpen, setManageOpen] = useState(false);
  const [draft, setDraft] = useState<StageDraft>(() => emptyDraft(stages.length + 1));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<StageDraft>(emptyDraft(1));

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
  );

  // 按阶段统计字形变体总数
  const variantCountByStage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of radicals) {
      for (const v of r.variants) {
        if (v.svgPath) counts.set(v.stageId, (counts.get(v.stageId) || 0) + 1);
      }
    }
    return counts;
  }, [radicals]);

  const selectedRadical = radicals.find((r) => r.id === selectedRadicalId);

  const currentStageIndex = sortedStages.findIndex((s) => s.id === selectedStageId);

  const gotoStage = (dir: -1 | 1) => {
    const nextIdx = Math.max(0, Math.min(sortedStages.length - 1, currentStageIndex + dir));
    if (nextIdx >= 0) selectStage(sortedStages[nextIdx].id);
  };

  // —— 自动播放 ——
  const PLAYBACK_INTERVAL = 1600;
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageNodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const currentStage = currentStageIndex >= 0 ? sortedStages[currentStageIndex] : undefined;

  const clearPlayTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopPlayback = (resetToFirst: boolean) => {
    clearPlayTimer();
    setIsPlaying(false);
    if (resetToFirst && sortedStages.length > 0) {
      selectStage(sortedStages[0].id);
    }
  };

  const togglePlayback = () => {
    if (!selectedRadical || sortedStages.length === 0) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    // 已停在最后一个阶段时再次播放，从头开始
    if (currentStageIndex >= sortedStages.length - 1 || currentStageIndex < 0) {
      selectStage(sortedStages[0].id);
    }
    setIsPlaying(true);
  };

  // 按阶段顺序推进；依赖变化（选阶段/换字根/阶段增删）时重新计时
  useEffect(() => {
    if (!isPlaying || !selectedRadicalId) return;
    if (currentStageIndex < 0 || currentStageIndex >= sortedStages.length - 1) {
      setIsPlaying(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      selectStage(sortedStages[currentStageIndex + 1].id);
    }, PLAYBACK_INTERVAL);
    return clearPlayTimer;
  }, [isPlaying, currentStageIndex, selectedRadicalId, sortedStages, selectStage]);

  // 播放时把当前阶段圆点滚动到可视区
  useEffect(() => {
    if (!isPlaying) return;
    stageNodeRefs.current.get(selectedStageId ?? '')?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [isPlaying, selectedStageId]);

  // 卸载时清理定时器
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const handleSelectRadical = (id: string | null) => {
    selectRadical(id);
    if (!id) {
      stopPlayback(false);
    } else if (isPlaying && sortedStages.length > 0) {
      // 播放中切换字根：从第一个阶段重新播放新字根
      selectStage(sortedStages[0].id);
    }
  };

  const handleAddStage = () => {
    const name = draft.name.trim();
    if (!name) {
      alert('请填写阶段名称');
      return;
    }
    addStage({
      name,
      order: Math.max(1, Math.min(sortedStages.length + 1, Math.round(draft.order) || 1)) - 1,
      description: draft.description.trim(),
      color: draft.color,
    });
    setDraft(emptyDraft(sortedStages.length + 2));
  };

  const startEdit = (st: HistoricalStage, index: number) => {
    setEditingId(st.id);
    setEditDraft({ name: st.name, order: index + 1, description: st.description, color: st.color });
  };

  const commitEdit = () => {
    if (!editingId) return;
    const name = editDraft.name.trim();
    if (!name) {
      alert('请填写阶段名称');
      return;
    }
    const index = sortedStages.findIndex((st) => st.id === editingId);
    const desired = Math.max(1, Math.min(sortedStages.length, Math.round(editDraft.order) || index + 1)) - 1;
    if (desired !== index) reorderStage(editingId, desired);
    updateStage(editingId, {
      name,
      description: editDraft.description.trim(),
      color: editDraft.color,
    });
    setEditingId(null);
  };

  const handleRemove = (st: HistoricalStage) => {
    const count = variantCountByStage.get(st.id) || 0;
    const msg =
      count > 0
        ? `确定移除阶段「${st.name}」吗？\n该阶段下的 ${count} 个字形变体将一并清除，此操作无法撤销。`
        : `确定移除阶段「${st.name}」吗？此操作无法撤销。`;
    if (confirm(msg)) {
      removeStage(st.id);
      if (editingId === st.id) setEditingId(null);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8 animate-fade-up flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-kai text-ink-500 font-bold tracking-wider flex items-center gap-3 mb-2">
            <Layers className="text-bronze-400" size={28} />
            演化时间线
          </h2>
          <p className="text-ink-300 font-song text-sm">
            穿越 <span className="text-bronze-500 font-bold">{sortedStages.length}</span> 个历史阶段，见证每一个字形的演变历程
          </p>
        </div>
        <button
          onClick={() => {
            setManageOpen((v) => {
              if (!v) {
                setDraft(emptyDraft(stages.length + 1));
                setEditingId(null);
              }
              return !v;
            });
          }}
          className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl font-kai text-sm transition-all border-2 ${
            manageOpen
              ? 'bg-vermilion-500 text-parchment-50 border-vermilion-600/40 shadow-seal'
              : 'bg-parchment-50 text-ink-400 border-parchment-300/50 shadow-scroll hover:border-vermilion-500/40 hover:text-vermilion-500'
          }`}
        >
          <Settings2 size={16} />
          阶段管理
        </button>
      </div>

      <div className="relative mb-10 animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="relative bg-parchment-50 rounded-2xl p-8 shadow-scroll border border-parchment-300/40 overflow-hidden">
          <div className="absolute inset-0 bg-paper-texture pointer-events-none opacity-60" />

          <div className="relative flex items-center justify-between gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => gotoStage(-1)}
              disabled={currentStageIndex <= 0}
              className="shrink-0 w-10 h-10 rounded-full bg-ink-300/10 hover:bg-ink-300/20 disabled:opacity-30 disabled:cursor-not-allowed text-ink-400 flex items-center justify-center transition-all"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex-1 flex items-center gap-4 px-2">
              {sortedStages.map((st, idx) => {
                const isActive = st.id === selectedStageId;
                const variantCount = radicals.filter(
                  (r) => r.variants.some((v) => v.stageId === st.id)
                ).length;
                return (
                  <React.Fragment key={st.id}>
                    <button
                      ref={(node) => {
                        if (node) stageNodeRefs.current.set(st.id, node);
                        else stageNodeRefs.current.delete(st.id);
                      }}
                      onClick={() => selectStage(st.id)}
                      className={`flex flex-col items-center gap-2 shrink-0 min-w-[110px] transition-all duration-300 ${
                        isActive ? 'scale-110' : 'hover:scale-105'
                      }`}
                    >
                      <div
                        className={`relative w-16 h-16 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${
                          isActive
                            ? 'bg-vermilion-500 border-vermilion-600 shadow-seal animate-glow-pulse'
                            : 'bg-parchment-100 border-parchment-300/60 hover:border-bronze-400'
                        }`}
                      >
                        <span
                          className={`font-kai text-lg font-bold ${
                            isActive ? 'text-parchment-50' : 'text-ink-400'
                          }`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        {variantCount > 0 && (
                          <div
                            className={`absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                              isActive
                                ? 'bg-parchment-50 text-vermilion-500'
                                : 'bg-bronze-400 text-parchment-50'
                            }`}
                          >
                            {variantCount}
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <div
                          className={`font-kai font-bold ${
                            isActive ? 'text-vermilion-500 text-lg' : 'text-ink-400'
                          }`}
                        >
                          {st.name}
                        </div>
                        <div className="text-[10px] text-ink-200 font-song mt-0.5 max-w-[110px] line-clamp-2 leading-tight">
                          {st.description}
                        </div>
                      </div>
                    </button>
                    {idx < sortedStages.length - 1 && (
                      <div className="shrink-0 w-8">
                        <div
                          className={`h-1 rounded-full transition-colors duration-500 ${
                            idx < currentStageIndex ? 'bg-bronze-400' : 'bg-parchment-300/50'
                          }`}
                          style={{
                            backgroundImage:
                              idx < currentStageIndex
                                ? 'linear-gradient(90deg, #5D7A6F, #7A968A)'
                                : undefined,
                          }}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <button
              onClick={() => gotoStage(1)}
              disabled={currentStageIndex >= sortedStages.length - 1}
              className="shrink-0 w-10 h-10 rounded-full bg-ink-300/10 hover:bg-ink-300/20 disabled:opacity-30 disabled:cursor-not-allowed text-ink-400 flex items-center justify-center transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {manageOpen && (
        <div className="mb-10 animate-fade-up" style={{ animationDelay: '60ms' }}>
          <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40">
            <div className="flex items-center justify-between mb-5 pb-3 border-b-2 border-dashed border-parchment-300/60">
              <h3 className="font-kai text-xl text-ink-500 font-bold flex items-center gap-2">
                <span className="w-1.5 h-6 rounded bg-vermilion-500" />
                历史阶段管理
              </h3>
              <span className="text-xs font-song text-ink-300 bg-parchment-100/60 px-3 py-1 rounded-lg">
                共 {sortedStages.length} 个阶段 · 改动即时生效
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 新增阶段 */}
              <div className="lg:col-span-1">
                <div className="rounded-xl border border-bronze-400/30 bg-bronze-400/5 p-4 space-y-3.5 h-full">
                  <div className="font-kai text-sm text-bronze-500 font-bold flex items-center gap-1.5">
                    <Plus size={15} />
                    新增阶段
                  </div>
                  <div>
                    <label className="block font-kai text-xs text-ink-400 mb-1">名称 <span className="text-vermilion-500">*</span></label>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
                      placeholder="如：简牍隶书"
                      className="w-full px-3 py-2 rounded-lg bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-kai text-sm placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30"
                    />
                  </div>
                  <div>
                    <label className="block font-kai text-xs text-ink-400 mb-1">顺序（第几位）</label>
                    <input
                      type="number"
                      min={1}
                      max={sortedStages.length + 1}
                      value={draft.order}
                      onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-500/30"
                    />
                  </div>
                  <div>
                    <label className="block font-kai text-xs text-ink-400 mb-1">说明</label>
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      rows={2}
                      placeholder="此阶段字形特征…"
                      className="w-full px-3 py-2 rounded-lg bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song text-sm placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block font-kai text-xs text-ink-400 mb-1.5">标识色</label>
                    <ColorSwatches value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
                  </div>
                  <button
                    onClick={handleAddStage}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-bronze-400 hover:bg-bronze-500 text-parchment-50 rounded-lg font-kai text-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <Plus size={16} />
                    添加阶段
                  </button>
                </div>
              </div>

              {/* 已有阶段 */}
              <div className="lg:col-span-2">
                {sortedStages.length === 0 ? (
                  <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-parchment-300/60 bg-parchment-100/30">
                    <div className="text-4xl mb-2 opacity-30">🏺</div>
                    <p className="font-kai text-ink-300 text-sm">尚无历史阶段，先在左侧添加一个吧</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {sortedStages.map((st, idx) => {
                      const isEditing = editingId === st.id;
                      const variantCount = variantCountByStage.get(st.id) || 0;
                      const d = isEditing ? editDraft : null;
                      return (
                        <div
                          key={st.id}
                          className={`rounded-xl border p-3.5 transition-all ${
                            isEditing
                              ? 'border-vermilion-500/50 shadow-md bg-parchment-50'
                              : 'border-parchment-300/40 bg-parchment-100/30 hover:bg-parchment-100/60'
                          }`}
                        >
                          {isEditing && d ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="shrink-0 w-8 text-center font-kai text-sm text-ink-300">{idx + 1}</span>
                                <input
                                  value={d.name}
                                  onChange={(e) => setEditDraft({ ...d, name: e.target.value })}
                                  onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                                  placeholder="阶段名称"
                                  className="flex-1 px-3 py-2 rounded-lg bg-white border border-parchment-300 text-ink-500 font-kai text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-500/30"
                                />
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <label className="font-kai text-xs text-ink-300">序</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={sortedStages.length}
                                    value={d.order}
                                    onChange={(e) => setEditDraft({ ...d, order: Number(e.target.value) })}
                                    className="w-16 px-2 py-2 rounded-lg bg-white border border-parchment-300 text-ink-500 font-song text-sm text-center focus:outline-none focus:ring-2 focus:ring-vermilion-500/30"
                                  />
                                </div>
                              </div>
                              <textarea
                                value={d.description}
                                onChange={(e) => setEditDraft({ ...d, description: e.target.value })}
                                rows={2}
                                placeholder="阶段说明"
                                className="w-full px-3 py-2 rounded-lg bg-white border border-parchment-300 text-ink-500 font-song text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 resize-none"
                              />
                              <div className="flex items-center justify-between">
                                <ColorSwatches value={d.color} onChange={(color) => setEditDraft({ ...d, color })} />
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={commitEdit}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-vermilion-500 hover:bg-vermilion-600 text-parchment-50 font-kai text-xs transition-all"
                                  >
                                    <Check size={13} /> 保存
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ink-200/40 hover:bg-ink-300 text-ink-400 hover:text-parchment-50 font-kai text-xs transition-all"
                                  >
                                    <X size={13} /> 取消
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 flex flex-col">
                                <button
                                  onClick={() => reorderStage(st.id, idx - 1)}
                                  disabled={idx === 0}
                                  className="text-ink-300 hover:text-vermilion-500 disabled:opacity-25 disabled:cursor-not-allowed transition-colors p-0.5"
                                  title="上移"
                                >
                                  <ChevronUp size={15} />
                                </button>
                                <button
                                  onClick={() => reorderStage(st.id, idx + 1)}
                                  disabled={idx === sortedStages.length - 1}
                                  className="text-ink-300 hover:text-vermilion-500 disabled:opacity-25 disabled:cursor-not-allowed transition-colors p-0.5"
                                  title="下移"
                                >
                                  <ChevronDown size={15} />
                                </button>
                              </div>
                              <span
                                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-parchment-50 font-kai text-xs font-bold"
                                style={{ backgroundColor: st.color }}
                              >
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-kai text-base font-bold text-ink-500 truncate">{st.name}</span>
                                  <span className="shrink-0 text-[10px] font-song text-ink-300 bg-parchment-200/60 px-1.5 py-0.5 rounded">
                                    {variantCount} 变体
                                  </span>
                                </div>
                                <p className="text-[11px] text-ink-300 font-song truncate mt-0.5">
                                  {st.description || '暂无说明'}
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                <button
                                  onClick={() => startEdit(st, idx)}
                                  className="w-8 h-8 rounded-lg bg-ink-300/15 hover:bg-ink-400 text-ink-400 hover:text-parchment-50 flex items-center justify-center transition-all"
                                  title="编辑"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleRemove(st)}
                                  className="w-8 h-8 rounded-lg bg-vermilion-500/15 hover:bg-vermilion-500 text-vermilion-500 hover:text-parchment-50 flex items-center justify-center transition-all"
                                  title="移除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-1">
          <div className="sticky top-28">
            <div className="bg-parchment-50 rounded-2xl p-5 shadow-scroll border border-parchment-300/40 mb-4">
              <h3 className="font-kai text-lg text-ink-500 font-bold mb-3 flex items-center gap-2">
                <BookMarked size={18} className="text-vermilion-500" />
                字根一览
              </h3>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {radicals.map((r) => {
                  const hasVariant = r.variants.some((v) => v.stageId === selectedStageId);
                  const isActive = r.id === selectedRadicalId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelectRadical(isActive ? null : r.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 text-left ${
                        isActive
                          ? 'bg-vermilion-500/15 border border-vermilion-500/40'
                          : hasVariant
                          ? 'bg-parchment-100/50 hover:bg-parchment-100 border border-transparent hover:border-parchment-300/50'
                          : 'opacity-50 bg-parchment-100/20 hover:bg-parchment-100/40 border border-transparent'
                      }`}
                    >
                      <div
                        className={`shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                          hasVariant ? 'bg-parchment-50 shadow-inner' : 'bg-parchment-100/30'
                        }`}
                      >
                        <GlyphRenderer radical={r} stageId={selectedStageId} size={40} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-kai text-base text-ink-500 font-bold">{r.name}</span>
                          {!hasVariant && (
                            <span className="text-[10px] text-ink-200 font-kai px-1.5 py-0.5 bg-ink-100 rounded">
                              缺
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-300 font-song truncate mt-0.5">
                          {r.meaning.split('；')[0]}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-3">
          {selectedRadical ? (
            <div className="animate-fade-up">
              <div className="bg-parchment-50 rounded-2xl p-8 shadow-scroll border border-parchment-300/40 mb-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="font-kai text-3xl text-ink-500 font-bold tracking-wider flex items-center gap-3">
                      <span className="w-2 h-10 rounded-full bg-vermilion-500" />
                      {selectedRadical.name}
                    </h3>
                    <p className="font-song text-ink-300 mt-2 ml-5">
                      [{selectedRadical.pronunciation}] · {selectedRadical.meaning}
                    </p>
                  </div>
                  <span className="px-4 py-1.5 rounded-xl bg-bronze-400/15 text-bronze-500 font-kai border border-bronze-400/20">
                    {selectedRadical.category}字
                  </span>
                </div>

                {/* 自动播放控制条 */}
                <div className="flex items-center gap-4 p-4 mb-6 rounded-2xl bg-parchment-100/50 border border-parchment-300/50">
                  <button
                    onClick={togglePlayback}
                    disabled={sortedStages.length === 0}
                    className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl font-kai text-sm text-parchment-50 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-seal ${
                      isPlaying ? 'bg-bronze-500 hover:bg-bronze-400' : 'bg-vermilion-500 hover:bg-vermilion-600'
                    }`}
                  >
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    {isPlaying ? '暂停' : '播放'}
                  </button>
                  <button
                    onClick={() => stopPlayback(true)}
                    disabled={!isPlaying && currentStageIndex <= 0}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-kai text-sm bg-ink-300/15 text-ink-400 hover:bg-ink-300/25 hover:text-ink-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title="停止并回到第一个阶段"
                  >
                    <Square size={15} />
                    停止
                  </button>

                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`shrink-0 w-12 h-12 rounded-lg bg-parchment-50 shadow-inner flex items-center justify-center transition-all duration-300 ${
                        isPlaying ? 'ring-2 ring-vermilion-500/60 scale-105' : ''
                      }`}
                    >
                      <GlyphRenderer radical={selectedRadical} stageId={selectedStageId} size={40} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-kai text-base font-bold text-ink-500 flex items-center gap-2">
                        {currentStage ? currentStage.name : '—'}
                        {isPlaying && (
                          <span className="flex items-center gap-1 text-[10px] font-song text-vermilion-500 bg-vermilion-500/10 px-1.5 py-0.5 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-vermilion-500 animate-pulse" />
                            播放中
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-300 font-song truncate">
                        {currentStage?.description || '暂无阶段说明'}
                      </div>
                    </div>
                  </div>

                  <div className="ml-auto shrink-0 font-song text-xs text-ink-300">
                    {sortedStages.length > 0 ? `${currentStageIndex + 1} / ${sortedStages.length}` : '0 / 0'}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 max-w-[180px]">
                    {sortedStages.map((st, idx) => (
                      <button
                        key={st.id}
                        onClick={() => selectStage(st.id)}
                        title={st.name}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          idx === currentStageIndex
                            ? 'w-6 bg-vermilion-500'
                            : idx < currentStageIndex
                            ? 'w-2 bg-bronze-400 hover:bg-bronze-500'
                            : 'w-2 bg-parchment-300 hover:bg-ink-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {sortedStages.map((st, idx) => {
                    const variant = getVariantForStage(selectedRadical, st.id);
                    const isCurrent = st.id === selectedStageId;
                    return (
                      <button
                        key={st.id}
                        onClick={() => selectStage(st.id)}
                        className={`group relative bg-parchment-100/40 rounded-2xl p-5 border-2 transition-all duration-300 hover:shadow-lg ${
                          isCurrent
                            ? 'border-vermilion-500 shadow-seal ring-4 ring-vermilion-500/10 -translate-y-1'
                            : 'border-parchment-300/40 hover:border-bronze-400/50'
                        }`}
                      >
                        <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              variant
                                ? 'bg-bronze-400 text-parchment-50'
                                : 'bg-ink-200 text-parchment-100'
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <span className="font-kai text-xs font-bold" style={{ color: st.color }}>
                            {st.name}
                          </span>
                        </div>

                        <div
                          className={`mt-6 mb-4 mx-auto flex items-center justify-center rounded-xl p-3 ${
                            variant ? 'bg-parchment-50 shadow-inner' : 'bg-parchment-100/30'
                          }`}
                        >
                          {variant ? (
                            <ShapeRenderer
                              svgPath={variant.svgPath}
                              size={100}
                              strokeColor={isCurrent ? '#B23A29' : st.color}
                              strokeWidth={isCurrent ? 3 : 2.5}
                            />
                          ) : (
                            <div className="w-[100px] h-[100px] flex items-center justify-center text-ink-200 text-xs font-kai">
                              暂无此阶段<br />字形记录
                            </div>
                          )}
                        </div>

                        {variant?.note && (
                          <p className="text-[11px] text-ink-300 font-song text-center italic leading-relaxed border-t border-dashed border-parchment-300/50 pt-2 mt-2">
                            「{variant.note}」
                          </p>
                        )}

                        {isCurrent && (
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-vermilion-500 text-parchment-50 text-[10px] font-kai rounded-full shadow">
                            当前阶段
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40">
                <h4 className="font-kai text-xl text-ink-500 font-bold mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 rounded bg-bronze-400" />
                  演变脉络对比
                </h4>
                <div className="overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div
                      className="grid gap-3 mb-4"
                      style={{ gridTemplateColumns: `80px repeat(${sortedStages.length}, 1fr)` }}
                    >
                      <div />
                      {sortedStages.map((st) => (
                        <div
                          key={st.id}
                          className={`text-center rounded-lg py-1 transition-colors duration-300 ${
                            isPlaying && st.id === selectedStageId ? 'bg-vermilion-500/10' : ''
                          }`}
                        >
                          <div
                            className="font-kai text-sm font-bold"
                            style={{ color: st.color }}
                          >
                            {st.name}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      className="grid gap-3 items-center mb-2"
                      style={{ gridTemplateColumns: `80px repeat(${sortedStages.length}, 1fr)` }}
                    >
                      <div className="font-kai text-xs text-ink-300 text-right pr-2">字形</div>
                      {sortedStages.map((st) => {
                        const variant = getVariantForStage(selectedRadical, st.id);
                        const isCurrentColumn = isPlaying && st.id === selectedStageId;
                        return (
                          <div
                            key={st.id}
                            className={`aspect-square bg-parchment-100/50 rounded-xl p-2 flex items-center justify-center border transition-colors duration-300 ${
                              isCurrentColumn
                                ? 'border-vermilion-500/60 bg-vermilion-500/5'
                                : 'border-parchment-300/30'
                            }`}
                          >
                            {variant ? (
                              <ShapeRenderer
                                svgPath={variant.svgPath}
                                size={80}
                                strokeColor={st.color}
                                strokeWidth={2}
                              />
                            ) : (
                              <span className="text-ink-200 text-xs font-kai">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div
                      className="grid gap-3 items-start"
                      style={{ gridTemplateColumns: `80px repeat(${sortedStages.length}, 1fr)` }}
                    >
                      <div className="font-kai text-xs text-ink-300 text-right pr-2 pt-1">演变箭头</div>
                      {sortedStages.map((st, idx) => (
                        <div key={st.id} className="flex items-center justify-center gap-1 min-h-[32px]">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              getVariantForStage(selectedRadical, st.id)
                                ? 'bg-bronze-400'
                                : 'bg-ink-200'
                            }`}
                          />
                          {idx < sortedStages.length - 1 && (
                            <div className="flex-1 max-w-[40px] h-[2px] bg-gradient-to-r from-bronze-400/60 to-parchment-300/60" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-parchment-50 rounded-2xl p-20 text-center shadow-scroll border border-parchment-300/40">
              <div className="text-7xl mb-4 opacity-30">📖</div>
              <p className="font-kai text-2xl text-ink-300 mb-2">请从左侧选择一个字根</p>
              <p className="font-song text-sm text-ink-200">
                即可查看它在各历史阶段中的演变过程
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ColorSwatches: React.FC<{ value: string; onChange: (color: string) => void }> = ({
  value,
  onChange,
}) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    {STAGE_COLOR_PALETTE.map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        className={`w-6 h-6 rounded-full border-2 transition-all ${
          value.toLowerCase() === c.toLowerCase()
            ? 'border-vermilion-500 scale-110 shadow-md'
            : 'border-parchment-50/60 hover:scale-105'
        }`}
        style={{ backgroundColor: c }}
        title={c}
      />
    ))}
    <label
      className="relative w-6 h-6 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-ink-200 hover:border-vermilion-500/60 transition-all"
      title="自定义颜色"
    >
      <span
        className="absolute inset-0"
        style={{
          background: 'conic-gradient(#d33, #fc0, #6c3, #09c, #63c, #d33)',
          opacity: STAGE_COLOR_PALETTE.some((c) => c.toLowerCase() === value.toLowerCase()) ? 0.25 : 1,
        }}
      />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  </div>
);
