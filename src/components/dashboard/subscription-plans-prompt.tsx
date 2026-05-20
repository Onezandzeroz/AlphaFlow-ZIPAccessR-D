'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscriptionPlansStore } from '@/lib/subscription-plans-store';
import {
  X,
  ArrowRight,
  ShieldCheck,
  Lock,
  Check,
  Zap,
  Gift,
  Star,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ─── Plan definitions ──────────────────────────────────────────────────

interface PlanFeature {
  da: string;
  en: string;
}

interface Plan {
  id: string;
  name: string;
  priceDa: string;
  priceEn: string;
  priceUnitDa?: string;
  priceUnitEn?: string;
  savingsDa?: string;
  savingsEn?: string;
  descDa: string;
  descEn: string;
  features: PlanFeature[];
  limitDa?: string;
  limitEn?: string;
  bindDa: string;
  bindEn: string;
  ctaDa: string;
  ctaEn: string;
  popular?: boolean;
  badgeDa?: string;
  badgeEn?: string;
  isFree?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceDa: '0 kr.',
    priceEn: '0 kr.',
    priceUnitDa: '60 dage',
    priceUnitEn: '60 days',
    descDa: 'Periodevist behov for bogføring f.eks. opstartsvirksomhed',
    descEn: 'Periodic bookkeeping needs, e.g. startups',
    features: [
      { da: 'Fulgt bogføringssystem m. AI-afstemning', en: 'Full accounting w/ AI reconciliation' },
      { da: 'Fakturering', en: 'Invoicing' },
      { da: 'Momsindberetning', en: 'VAT reporting' },
      { da: 'Bilagsupload & OCR-scanning', en: 'Receipt upload & OCR scanning' },
      { da: 'Bankintegration', en: 'Bank integration' },
    ],
    limitDa: '',
    limitEn: '',
    bindDa: 'Ingen',
    bindEn: 'None',
    ctaDa: 'Prøv gratis nu',
    ctaEn: 'Try free now',
    isFree: true,
  },
  {
    id: 'monthly',
    name: 'Månedlig',
    priceDa: '129 kr./md.',
    priceEn: '129 kr./mo.',
    descDa: 'Godt i gang med virksomheden og ønsker stabil drift',
    descEn: 'Growing business wanting stable operations',
    features: [
      { da: 'Ingen begrænsninger', en: 'No limitations' },
      { da: 'Fuldt AI-drevet bogføring', en: 'Full AI-powered bookkeeping' },
      { da: 'Rådgivnings AI-Agent', en: 'Advisory AI agent' },
      { da: 'Revisoradgang', en: 'Auditor access' },
      { da: 'Mail & chat support', en: 'Mail & chat support' },
    ],
    bindDa: 'Ingen binding',
    bindEn: 'No commitment',
    ctaDa: 'Vælg månedlig',
    ctaEn: 'Choose monthly',
  },
  {
    id: 'annual',
    name: 'Årlig',
    priceDa: '99 kr./md.',
    priceEn: '99 kr./mo.',
    priceUnitDa: '(1.188 kr./år)',
    priceUnitEn: '(1,188 kr./yr)',
    savingsDa: 'Spar 360 kr./år',
    savingsEn: 'Save 360 kr./yr',
    descDa: 'Stabil drift med blikket rette fremad',
    descEn: 'Stable operations, looking ahead',
    features: [
      { da: '23 % rabat', en: '23% discount' },
      { da: 'Prioriteret support', en: 'Priority support' },
      { da: 'Stabil pris i 12 måneder', en: 'Fixed price 12 months' },
      { da: 'AI-Agent m. fuld indblik (Din digitale Revisor)', en: 'AI agent full insight (Digital Auditor)' },
    ],
    bindDa: '12 måneder',
    bindEn: '12 months',
    ctaDa: 'Vælg årlig',
    ctaEn: 'Choose annual',
    popular: true,
    badgeDa: 'ANBEFALET',
    badgeEn: 'RECOMMENDED',
  },
  {
    id: '2year',
    name: '2-årig',
    priceDa: '89 kr./md.',
    priceEn: '89 kr./mo.',
    priceUnitDa: '(2.136 kr./24 md.)',
    priceUnitEn: '(2,136 kr./24 mo.)',
    savingsDa: 'Spar 960 kr.',
    savingsEn: 'Save 960 kr.',
    descDa: 'Stabil drift — spar mest muligt langsigtet',
    descEn: 'Stable ops — maximize long-term savings',
    features: [
      { da: '31 % rabat', en: '31% discount' },
      { da: 'Prioriteret + hurtigere support', en: 'Priority + faster support' },
      { da: 'Hurtigere feature-requests', en: 'Faster feature requests' },
    ],
    bindDa: '24 måneder',
    bindEn: '24 months',
    ctaDa: 'Vælg 2-årig',
    ctaEn: 'Choose 2-year',
  },
  {
    id: '3year',
    name: '3-årig',
    priceDa: '79 kr./md.',
    priceEn: '79 kr./mo.',
    priceUnitDa: '(2.844 kr./36 md.)',
    priceUnitEn: '(2,844 kr./36 mo.)',
    savingsDa: 'Spar 1.800 kr.',
    savingsEn: 'Save 1,800 kr.',
    descDa: 'Størst rabat & eksklusiv adgang',
    descEn: 'Best discount & exclusive access',
    features: [
      { da: '39 % rabat', en: '39% discount' },
      { da: 'Højeste prioritet på support', en: 'Highest priority support' },
      { da: 'Eksklusive kommende AI-moduler', en: 'Exclusive upcoming AI modules' },
    ],
    bindDa: '36 måneder',
    bindEn: '36 months',
    ctaDa: 'Vælg 3-årig',
    ctaEn: 'Choose 3-year',
  },
];

// ─── Storage key prefixes ──────────────────────────────────────────────
const DISMISSED_PREFIX = 'alphaflow-plan-prompt-dismissed-';
const EVER_LOGGED_PREFIX = 'alphaflow-ever-logged-';

// ─── Plan Card Component ───────────────────────────────────────────────

function PlanCard({
  plan,
  isDa,
  onSelect,
  isActiveSlide,
  isMobile,
  startingTrial,
  t,
}: {
  plan: Plan;
  isDa: boolean;
  onSelect: (plan: Plan) => void;
  isActiveSlide?: boolean;
  isMobile?: boolean;
  startingTrial: boolean;
  t: (da: string, en: string) => string;
}) {
  const isPopular = plan.popular;
  const isFree = plan.isFree;
  const isLoading = isFree && startingTrial;

  return (
    <div
      className={`
        relative flex flex-col rounded-2xl text-center
        transition-all duration-300 group shrink-0
        ${isMobile
          ? `w-[85vw] max-w-[340px] p-5 ${isActiveSlide ? 'scale-100 opacity-100' : 'scale-[0.92] opacity-60'}`
          : 'p-3 sm:p-3.5 lg:p-4 hover:scale-[1.02] hover:shadow-lg'
        }
        ${isLoading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}
        ${isPopular
          ? 'bg-[#112240]/80 border-2 border-[#f59e0b]/80 dark:border-[#f59e0b]/60 ring-1 ring-[#f59e0b]/20 shadow-lg shadow-[#f59e0b]/5'
          : isFree
            ? 'bg-[#0a1628]/60 border border-[#1e3a5f]/50 dark:border-[#1a2d4d]/30 hover:border-[#2dd4bf]/30'
            : 'bg-[#0e1f3d]/80 border border-[#1e3a5f]/60 dark:border-[#1a2d4d]/40 hover:border-[#2dd4bf]/40'
        }
      `}
      onClick={() => onSelect(plan)}
      role="button"
      tabIndex={isLoading ? -1 : 0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !isLoading) onSelect(plan); }}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-[#f59e0b] text-white shadow-sm shadow-[#f59e0b]/30 whitespace-nowrap ${isMobile ? 'text-[11px]' : 'text-[9px] sm:text-[10px]'}`}>
            <Star className="h-3 w-3 sm:h-3 sm:w-3" />
            {isDa ? plan.badgeDa : plan.badgeEn}
          </span>
        </div>
      )}

      {/* Plan name */}
      <p className={`font-bold uppercase tracking-wider
        ${isMobile ? 'text-sm mt-1' : 'text-xs sm:text-sm lg:text-base'}
        ${isPopular ? 'text-[#f59e0b]' : isFree ? 'text-[#2dd4bf]/70' : 'text-[#2dd4bf]'}
      `}>
        {plan.name}
      </p>

      {/* Price block */}
      <div className={isMobile ? 'mt-3' : 'mt-1.5 sm:mt-2'}>
        <p className={`font-bold text-white tracking-tight leading-none
          ${isMobile ? 'text-3xl' : 'text-xl sm:text-2xl lg:text-3xl'}
        `}>
          {isDa ? plan.priceDa : plan.priceEn}
        </p>
        {plan.priceUnitDa && (
          <p className={`text-white/35 mt-0.5 ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs lg:text-sm'}`}>
            {isDa ? plan.priceUnitDa : plan.priceUnitEn}
          </p>
        )}
      </div>

      {/* Savings badge */}
      <div className={`${isMobile ? 'mt-2 h-7' : 'mt-1 sm:mt-1.5 h-[18px] sm:h-[22px]'} flex items-center justify-center`}>
        {plan.savingsDa && (
          <span className={`font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs'}`}>
            {isDa ? plan.savingsDa : plan.savingsEn}
          </span>
        )}
      </div>

      {/* Description */}
      <p className={`${isMobile ? 'mt-2.5 text-xs' : 'mt-2 sm:mt-2.5 text-[10px] sm:text-xs lg:text-sm'} text-white/45 leading-relaxed`}>
        {isDa ? plan.descDa : plan.descEn}
      </p>

      {/* Features list */}
      <ul className={`flex-1 text-left ${isMobile ? 'mt-3 space-y-2' : 'mt-2.5 sm:mt-3 space-y-1.5'}`}>
        {plan.features.map((feat, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className={`shrink-0 mt-0.5 ${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5 sm:h-4 sm:w-4'}
              ${isFree ? 'text-[#2dd4bf]/60' : isPopular ? 'text-[#f59e0b]/80' : 'text-[#2dd4bf]/80'}`}
            />
            <span className={`text-white/55 leading-snug ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs lg:text-sm'}`}>
              {isDa ? feat.da : feat.en}
            </span>
          </li>
        ))}
      </ul>

      {/* Binding / Limitation */}
      <div className={`${isMobile ? 'mt-3 pt-3' : 'mt-2 sm:mt-2.5 pt-2 sm:pt-2.5'} border-t border-white/[0.06]`}>
        <p className={`text-white/30 ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs'}`}>
          {isDa ? `Binding: ${plan.bindDa}` : `Commitment: ${plan.bindEn}`}
        </p>
      </div>

      {/* Trial badge (Free plan only) */}
      {isFree && (
        <div className="mt-2.5 inline-flex items-center justify-center gap-1.5 mx-auto px-3 py-1 rounded-full bg-[#0d9488]/20 border border-[#0d9488]/30">
          <Gift className={`text-[#2dd4bf] ${isMobile ? 'h-3.5 w-3.5' : 'h-3 w-3 sm:h-3.5 sm:w-3.5'}`} />
          <span className={`font-semibold text-[#2dd4bf] tracking-wide leading-tight ${isMobile ? 'text-[10px]' : 'text-[9px] sm:text-[10px]'}`}>
            {t('2 MDR. GRATIS · FULD ADGANG', '2 MOS. FREE · FULL ACCESS')}
          </span>
        </div>
      )}

      {/* CTA button */}
      <button
        type="button"
        disabled={isLoading}
        className={`
          mt-auto w-full flex items-center justify-center gap-2
          rounded-xl font-semibold
          transition-all duration-200 hover:shadow-md active:scale-[0.97]
          ${isMobile ? 'h-12 text-sm mt-4' : 'h-9 sm:h-10 lg:h-11 px-2 sm:px-3 text-xs sm:text-sm lg:text-base'}
          ${isLoading ? 'opacity-60 cursor-wait' : ''}
          ${isPopular
            ? 'bg-[#f59e0b] hover:bg-[#d97706] text-white shadow-[#f59e0b]/20'
            : isFree
              ? 'bg-[#0d9488]/60 hover:bg-[#0d9488]/80 text-white/80 hover:text-white border border-[#0d9488]/30'
              : 'bg-[#0d9488]/80 hover:bg-[#0d9488] text-white/90 hover:text-white border border-[#0d9488]/40'
          }
        `}
      >
        <span>{isLoading
          ? (isDa ? 'Starter prøveperiode...' : 'Starting trial...')
          : (isDa ? plan.ctaDa : plan.ctaEn)
        }</span>
        {!isLoading && (
          <ArrowRight className={`opacity-60 group-hover:opacity-100 transition-opacity ${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5 sm:h-4 sm:w-4'}`} />
        )}
      </button>
    </div>
  );
}

// ─── Dot Indicators Component ──────────────────────────────────────────

function DotIndicators({
  total,
  activeIndex,
  onSelect,
}: {
  total: number;
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {PLANS.map((plan, i) => (
        <button
          key={plan.id}
          type="button"
          onClick={() => onSelect(i)}
          className={`
            transition-all duration-300 rounded-full
            ${i === activeIndex
              ? 'w-7 h-2.5 bg-[#2dd4bf] shadow-sm shadow-[#2dd4bf]/30'
              : 'w-2.5 h-2.5 bg-white/20 hover:bg-white/40'
            }
          `}
          aria-label={`Go to plan ${i + 1}: ${plan.name}`}
        />
      ))}
    </div>
  );
}

// ─── Mobile Carousel Component ─────────────────────────────────────────

function MobileCarousel({
  plans,
  isDa,
  onSelect,
  startingTrial,
  t,
}: {
  plans: Plan[];
  isDa: boolean;
  onSelect: (plan: Plan) => void;
  startingTrial: boolean;
  t: (da: string, en: string) => string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Set initial scroll position via ref callback (no setState in effect)
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    scrollContainerRef.current = node;
    if (node && node.children.length > 0) {
      const child = node.children[0] as HTMLElement;
      const containerWidth = node.offsetWidth;
      const childLeft = child.offsetLeft;
      const childWidth = child.offsetWidth;
      const scrollLeft = childLeft - (containerWidth - childWidth) / 2;
      node.scrollTo({ left: scrollLeft });
    }
  }, []);

  const scrollToSlide = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, plans.length - 1));
    setActiveIndex(clamped);
    if (scrollRef.current) {
      const child = scrollRef.current.children[clamped] as HTMLElement;
      if (child) {
        const containerWidth = scrollRef.current.offsetWidth;
        const childLeft = child.offsetLeft;
        const childWidth = child.offsetWidth;
        const scrollLeft = childLeft - (containerWidth - childWidth) / 2;
        scrollRef.current.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, [plans.length]);

  // Handle scroll to update active index
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || isDragging.current) return;
    const container = scrollRef.current;
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.offsetWidth;
    const center = scrollLeft + containerWidth / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const distance = Math.abs(center - childCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }
    setActiveIndex(closestIndex);
  }, []);

  // Touch/swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    startX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    handleScroll();
  }, [handleScroll]);

  const handleNext = useCallback(() => scrollToSlide(activeIndex + 1), [activeIndex, scrollToSlide]);
  const handlePrev = useCallback(() => scrollToSlide(activeIndex - 1), [activeIndex, scrollToSlide]);

  return (
    <div className="flex flex-col">
      {/* Carousel */}
      <div className="relative">
        {/* Prev button */}
        {activeIndex > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-[#0e1f3d]/90 border border-white/10 text-white/70 hover:text-white hover:bg-[#0e1f3d] backdrop-blur-sm transition-all shadow-lg"
            aria-label="Previous plan"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* Scroll container */}
        <div
          ref={setScrollRef}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-8 py-3
            -mx-8 scrollbar-hide"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {plans.map((plan, i) => (
            <div key={plan.id} className="snap-center shrink-0 flex items-center">
              <PlanCard
                plan={plan}
                isDa={isDa}
                onSelect={onSelect}
                isActiveSlide={i === activeIndex}
                isMobile
                startingTrial={startingTrial}
                t={t}
              />
            </div>
          ))}
        </div>

        {/* Next button */}
        {activeIndex < plans.length - 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-[#0e1f3d]/90 border border-white/10 text-white/70 hover:text-white hover:bg-[#0e1f3d] backdrop-blur-sm transition-all shadow-lg"
            aria-label="Next plan"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Dot indicators */}
      <DotIndicators
        total={plans.length}
        activeIndex={activeIndex}
        onSelect={scrollToSlide}
      />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────

export function SubscriptionPlansPrompt() {
  const user = useAuthStore((s) => s.user);
  const { language } = useTranslation();
  const isDa = language === 'da';

  const [visible, setVisible] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hasScheduled = useRef(false);

  // Subscribe to external trigger store changes
  useEffect(() => {
    const unsub = useSubscriptionPlansStore.subscribe((state) => {
      if (state.isOpen) {
        setAnimatingIn(true);
        setVisible(true);
      }
    });
    return unsub;
  }, []);

  // Detect first-login per user
  useEffect(() => {
    if (!user || hasScheduled.current) return;
    if (user.isSuperDev) return;
    if (user.isDemoCompany) return;
    if (typeof window === 'undefined') return;
    const dismissedKey = `${DISMISSED_PREFIX}${user.id}`;
    const everLoggedKey = `${EVER_LOGGED_PREFIX}${user.id}`;
    if (localStorage.getItem(dismissedKey) === 'true') return;
    if (localStorage.getItem(everLoggedKey) === 'true') return;

    localStorage.setItem(everLoggedKey, 'true');
    hasScheduled.current = true;

    const timer = setTimeout(() => {
      setAnimatingIn(true);
      setVisible(true);
    }, 800);
  }, [user]);

  const dismiss = useCallback(() => {
    setAnimatingOut(true);
    setTimeout(() => {
      setVisible(false);
      setAnimatingIn(false);
      setAnimatingOut(false);
      if (user?.id) {
        localStorage.setItem(`${DISMISSED_PREFIX}${user.id}`, 'true');
      }
      useSubscriptionPlansStore.getState().dismiss();
    }, 300);
  }, [user]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) dismiss();
    },
    [dismiss],
  );

  const handleSelectPlan = useCallback(
    (plan: Plan) => {
      if (plan.isFree) {
        setStartingTrial(true);
        fetch('/api/trial/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              dismiss();
              window.dispatchEvent(new CustomEvent('access:refresh'));
            } else if (data.alreadyClaimed) {
              dismiss();
            }
          })
          .catch(() => {})
          .finally(() => {
            setStartingTrial(false);
          });
        return;
      }

      const targetSearch = '?tab=access';
      window.history.pushState({ view: 'settings' }, '', `/settings${targetSearch}`);
      window.dispatchEvent(
        new CustomEvent('app:navigate', {
          detail: { view: 'settings', search: targetSearch },
        }),
      );
      dismiss();
    },
    [dismiss],
  );

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, dismiss]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  const t = (da: string, en: string) => (isDa ? da : en);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={`fixed inset-0 z-[200] flex sm:items-center justify-center
        bg-black/70 dark:bg-black/85 backdrop-blur-sm
        transition-opacity duration-300
        ${animatingIn && !animatingOut ? 'opacity-100' : animatingOut ? 'opacity-0' : 'opacity-0'}
      `}
    >
      {/* ── Card container ── */}
      <div
        className={`
          relative w-full
          /* Mobile: full screen height; Desktop: 16:9 ratio */
          h-full sm:h-auto sm:aspect-[16/9] sm:max-w-[1280px] sm:max-h-[95vh]
          rounded-t-3xl sm:rounded-2xl
          overflow-y-auto overflow-x-hidden
          transition-all duration-300
          ${animatingIn && !animatingOut ? 'translate-y-0 sm:scale-100 opacity-100' : animatingOut ? 'translate-y-full sm:scale-95 opacity-0' : 'translate-y-full sm:scale-95 opacity-0'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Inner card ── */}
        <div className="relative flex flex-col h-full sm:h-auto overflow-hidden bg-[#0c1a33] dark:bg-[#091325] border border-[#1a2d4d]/60 dark:border-[#152240]/80 sm:rounded-2xl rounded-t-3xl">
          {/* Background dot grid */}
          <div
            className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Decorative glow orbs */}
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#0d9488]/[0.06] blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-[#2dd4bf]/[0.04] blur-3xl pointer-events-none" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full bg-[#f59e0b]/[0.025] blur-3xl pointer-events-none" />

          {/* ── Mobile drag handle ── */}
          <div className="sm:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* ── Header ── */}
          <div className="relative shrink-0 pt-2 sm:pt-5 md:pt-6 pb-3 sm:pb-4 px-5 sm:px-8 text-center">
            {/* Close button — large touch target on mobile */}
            <button
              type="button"
              onClick={dismiss}
              className="absolute top-4 right-4 sm:top-4 sm:right-4
                w-11 h-11 sm:w-9 sm:h-9
                flex items-center justify-center
                rounded-xl sm:rounded-lg bg-white/10 hover:bg-white/20
                text-white/60 hover:text-white transition-colors cursor-pointer"
              aria-label={t('Luk', 'Close')}
            >
              <X className="h-5 w-5 sm:h-5 sm:w-5" />
            </button>

            <h2 className="text-2xl sm:text-2xl lg:text-[1.65rem] font-bold text-white tracking-tight leading-tight">
              {t('Velkommen til AlphaFlow', 'Welcome to AlphaFlow')}
            </h2>
            <p className="mt-2 sm:mt-1.5 text-sm sm:text-sm lg:text-base text-white/50 max-w-2xl mx-auto leading-relaxed">
              {t(
                'Vælg en plan, der passer til din virksomhed, med det samme. På den måde bevarer du skriveadgangen og undgår afbrydelser i arbejdets kontinuitet, når prøveperioden slutter.',
                'Choose a plan that fits your business right away. That way you keep write access and avoid interruptions to your work continuity when the trial ends.',
              )}
            </p>
          </div>

          {/* ── Plans section ── */}
          <div className="relative flex-1 min-h-0 px-2 sm:px-5 lg:px-6 pb-2 sm:pb-4 flex flex-col">
            {/* Mobile: Carousel layout */}
            <div className="sm:hidden flex flex-col flex-1 min-h-0 justify-center">
              <MobileCarousel
                plans={PLANS}
                isDa={isDa}
                onSelect={handleSelectPlan}
                startingTrial={startingTrial}
                t={t}
              />
            </div>

            {/* Tablet & Desktop: Grid layout */}
            <div className="hidden sm:flex flex-col flex-1 min-h-0">
              <div className="grid grid-cols-3 lg:grid-cols-5 gap-2.5 lg:gap-3 flex-1 min-h-0">
                {PLANS.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isDa={isDa}
                    onSelect={handleSelectPlan}
                    startingTrial={startingTrial}
                    t={t}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Bottom bar ── */}
          <div className="relative shrink-0 border-t border-white/[0.06] px-5 sm:px-8 py-4 sm:py-4">
            {/* Mobile: stacked features */}
            <div className="sm:hidden space-y-2.5">
              <div className="flex items-center justify-center gap-2 text-white/35 text-xs">
                <Gift className="h-4 w-4 text-[#2dd4bf]/70" />
                <span>{t('2 måneder gratis', '2 months free')}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-white/35 text-xs">
                <ShieldCheck className="h-4 w-4 text-[#2dd4bf]/70" />
                <span>{t('Fuld adgang', 'Full access')}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-white/35 text-xs">
                <Zap className="h-4 w-4 text-[#2dd4bf]/70" />
                <span>{t('Ingen binding på prøve', 'No trial commitment')}</span>
              </div>
            </div>

            {/* Desktop: inline features row */}
            <div className="hidden sm:flex items-center justify-center gap-3 sm:gap-5 lg:gap-6 text-white/35 text-[10px] sm:text-xs lg:text-sm">
              <div className="flex items-center gap-1">
                <Gift className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#2dd4bf]/70" />
                <span>{t('2 måneder gratis', '2 months free')}</span>
              </div>
              <div className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#2dd4bf]/70" />
                <span>{t('Fuld adgang', 'Full access')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#2dd4bf]/70" />
                <span>{t('Ingen binding på prøve', 'No trial commitment')}</span>
              </div>
            </div>

            {/* Bottom branding */}
            <div className="mt-3 sm:mt-2.5 flex items-center justify-center gap-2 text-white/15 text-[10px] sm:text-xs tracking-widest">
              <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              <span>WEB ACCESS PROOF &middot; .TBKEY</span>
              <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
