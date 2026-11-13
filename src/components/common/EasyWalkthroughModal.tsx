import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { NavigationTab } from '../../types/rental';
import {
  GUIDE_CATEGORIES,
  GUIDE_FLOWS,
  GuideCategory,
  GuideFlowDefinition,
  GuideFlowId,
} from '../../data/guideFlows';
import { FlowSpriteStage, GuideBuddySprite } from '../guide/GuideSprites';

interface EasyWalkthroughModalProps {
  isOpen: boolean;
  initialFlowId?: GuideFlowId;
  onClose: () => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onOpenAddRoom: () => void;
  onOpenScanner: () => void;
}

export const EasyWalkthroughModal: React.FC<EasyWalkthroughModalProps> = ({
  isOpen,
  initialFlowId = 'room-lifecycle',
  onClose,
  onNavigateTab,
  onOpenAddRoom,
  onOpenScanner,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | GuideCategory>('All');
  const [activeFlowId, setActiveFlowId] = useState<GuideFlowId>(initialFlowId);
  const [activeSubStep, setActiveSubStep] = useState<0 | 1 | 2>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [exploredIds, setExploredIds] = useState<GuideFlowId[]>(['room-lifecycle']);

  const filteredFlows = useMemo(() => {
    if (selectedCategory === 'All') return GUIDE_FLOWS;
    return GUIDE_FLOWS.filter((f) => f.category === selectedCategory);
  }, [selectedCategory]);

  const currentFlow: GuideFlowDefinition = useMemo(() => {
    return (
      filteredFlows.find((f) => f.id === activeFlowId) ||
      filteredFlows[0] ||
      GUIDE_FLOWS[0]
    );
  }, [filteredFlows, activeFlowId]);

  const currentFlowIndex = useMemo(() => {
    return GUIDE_FLOWS.findIndex((f) => f.id === currentFlow.id);
  }, [currentFlow.id]);

  // Reset category, flow & sub-step playback when opening modal
  useEffect(() => {
    if (!isOpen) return;
    setSelectedCategory('All');
    setActiveFlowId(initialFlowId);
    setActiveSubStep(0);
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIsPlaying(!reduced);
  }, [isOpen, initialFlowId]);

  // Track explored flows accurately
  useEffect(() => {
    if (!isOpen) return;
    setExploredIds((prev) =>
      prev.includes(currentFlow.id) ? prev : [...prev, currentFlow.id]
    );
  }, [isOpen, currentFlow.id]);

  // Advance Sprite frame across Step 1 -> Step 2 -> Step 3 while playing
  useEffect(() => {
    if (!isOpen || !isPlaying) return;
    const timer = window.setInterval(() => {
      setActiveSubStep((prev) => ((prev + 1) % 3) as 0 | 1 | 2);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [isOpen, isPlaying, currentFlow.id]);

  if (!isOpen) return null;

  const selectFlow = (flowId: GuideFlowId) => {
    setActiveFlowId(flowId);
    setActiveSubStep(0);
  };

  const handleSelectCategory = (cat: 'All' | GuideCategory) => {
    setSelectedCategory(cat);
    const nextList =
      cat === 'All'
        ? GUIDE_FLOWS
        : GUIDE_FLOWS.filter((f) => f.category === cat);
    if (nextList.length > 0 && !nextList.some((f) => f.id === activeFlowId)) {
      setActiveFlowId(nextList[0].id);
    }
    setActiveSubStep(0);
  };

  const handleSelectStep = (idx: 0 | 1 | 2) => {
    setActiveSubStep(idx);
    setIsPlaying(false);
  };

  const handleTriggerAction = (flow: GuideFlowDefinition) => {
    if (flow.actionTarget.type === 'addRoom') {
      onNavigateTab('rooms');
      onOpenAddRoom();
    } else if (flow.actionTarget.type === 'scanner') {
      onOpenScanner();
    } else {
      onNavigateTab(flow.actionTarget.tab);
    }
    onClose();
  };

  const handlePrevFlow = () => {
    if (currentFlowIndex > 0) {
      selectFlow(GUIDE_FLOWS[currentFlowIndex - 1].id);
      setSelectedCategory('All');
    }
  };

  const handleNextFlow = () => {
    if (currentFlowIndex < GUIDE_FLOWS.length - 1) {
      selectFlow(GUIDE_FLOWS[currentFlowIndex + 1].id);
      setSelectedCategory('All');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto no-print">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#131A28] border border-amber-500/35 shadow-2xl overflow-hidden animate-modal-pop">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-[#182234] border-b border-[#26344E] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  4Rent Quick Guide
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-extrabold text-emerald-300 font-mono-num">
                  {exploredIds.length}/{GUIDE_FLOWS.length} Viewed
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Step-by-step workflows &amp; built-in safeguards
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="w-9 h-9 rounded-xl bg-[#0E1420] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer btn-fluid shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Bar */}
        <div className="px-5 sm:px-6 py-3 bg-[#101724] border-b border-[#223048] flex items-center gap-2 overflow-x-auto shrink-0">
          {GUIDE_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleSelectCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold whitespace-nowrap border transition cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm shadow-amber-500/20'
                    : 'bg-[#172032] text-slate-300 hover:text-white border-[#27344E]'
                }`}
              >
                {cat === 'All' ? `All Flows (${GUIDE_FLOWS.length})` : cat}
              </button>
            );
          })}
        </div>

        {/* Organized Body: Left Flow Rail (Desktop) + Main Sprite Stage & Instructions */}
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-[255px_1fr]">
          {/* Mobile Flow Switcher Pills */}
          <div className="md:hidden px-4 pt-3 pb-1 flex items-center gap-2 overflow-x-auto">
            {filteredFlows.map((flow) => {
              const isSelected = flow.id === currentFlow.id;
              return (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => selectFlow(flow.id)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-extrabold whitespace-nowrap border transition cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                      : 'bg-[#0E1420] text-slate-400 border-[#223049]'
                  }`}
                >
                  <span className="font-mono-num">{flow.order}.</span>
                  <span>{flow.shortTitle}</span>
                </button>
              );
            })}
          </div>

          {/* Desktop Left Flow Rail */}
          <aside className="hidden md:flex flex-col border-r border-[#223048] bg-[#0F1522] p-3.5 space-y-1.5 overflow-y-auto">
            {filteredFlows.map((flow) => {
              const isSelected = flow.id === currentFlow.id;
              const visited = exploredIds.includes(flow.id);
              return (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => selectFlow(flow.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-[#172133] text-slate-300'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                      Flow {flow.order} • {flow.category}
                    </div>
                    <div className="text-xs font-extrabold truncate mt-0.5">
                      {flow.shortTitle}
                    </div>
                  </div>
                  {visited && (
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-amber-400' : 'text-emerald-400/80'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </aside>

          {/* Right Stage: Mascot + Animated Flow Sprite + Precision Steps */}
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
            {/* Flow Title & Play Controls */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-[10px] font-extrabold text-amber-300">
                  Flow {currentFlow.order} of {GUIDE_FLOWS.length} •{' '}
                  {currentFlow.category}
                </span>
                <h4 className="text-base sm:text-lg font-extrabold text-white mt-1.5 leading-snug">
                  {currentFlow.title}
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {currentFlow.subtitle}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0D131E] hover:bg-[#182235] border border-[#27344E] text-[11px] font-bold text-slate-200 cursor-pointer shrink-0"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-400" />
                    <span>Pause Sprite</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Play Sprite</span>
                  </>
                )}
              </button>
            </div>

            {/* Buddy Mascot Tip */}
            <GuideBuddySprite
              mood={currentFlow.mascotMood}
              tip={currentFlow.mascotTip}
              isPlaying={isPlaying}
            />

            {/* Animated Interactive Micro-UI Sprite Stage */}
            <FlowSpriteStage
              flowId={currentFlow.id}
              activeSubStep={activeSubStep}
              isPlaying={isPlaying}
            />

            {/* 3 Precision Sub-Steps (Clickable to inspect exact frame) */}
            <div className="space-y-2">
              {currentFlow.steps.map((step, idx) => {
                const subIdx = idx as 0 | 1 | 2;
                const isActive = activeSubStep === subIdx;
                return (
                  <button
                    key={step.stepNo}
                    type="button"
                    onClick={() => handleSelectStep(subIdx)}
                    className={`w-full text-left rounded-2xl p-3 sm:p-3.5 border transition cursor-pointer flex items-start gap-3 ${
                      isActive
                        ? 'bg-[#172133] border-amber-500/55 shadow-md shadow-amber-500/10'
                        : 'bg-[#0D121C] border-[#212E45] hover:border-[#2E3F5E] opacity-85'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-lg font-mono-num text-xs font-black flex items-center justify-center shrink-0 mt-0.5 ${
                        isActive
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#182235] text-slate-300'
                      }`}
                    >
                      {step.stepNo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-extrabold text-white">
                          {step.title}
                        </span>
                        <span className="text-[10px] font-bold text-amber-300/90 shrink-0 hidden sm:inline">
                          {step.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {step.instruction}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Key System Rule Callout */}
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-100 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-amber-300">System Rule:</strong>{' '}
                {currentFlow.ruleWarning}
              </span>
            </div>

            {/* 1-Click Launch Feature Button */}
            <button
              type="button"
              onClick={() => handleTriggerAction(currentFlow)}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer btn-fluid"
            >
              <span>{currentFlow.actionLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Footer Flow Navigation */}
        <div className="px-5 sm:px-6 py-3.5 bg-[#0E1420] border-t border-[#222F46] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            disabled={currentFlowIndex <= 0}
            onClick={handlePrevFlow}
            className="px-3.5 py-2 rounded-xl bg-[#172133] hover:bg-[#202E47] disabled:opacity-40 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer btn-fluid"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous Flow</span>
          </button>

          <div className="flex items-center gap-2">
            {currentFlowIndex < GUIDE_FLOWS.length - 1 ? (
              <button
                type="button"
                onClick={handleNextFlow}
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-extrabold flex items-center gap-1 cursor-pointer btn-fluid"
              >
                <span>Next Flow</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer btn-fluid"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Finish Guide</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
