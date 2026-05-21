'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Lock, ShieldCheck, ArrowRight, Star, Check, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Plan definitions (shared with subscription-plans-prompt) ─────────

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
    id: 'monthly',
    name: 'Månedlig',
    priceDa: '129 kr./md.',
    priceEn: '129 kr./mo.',
    descDa: 'Stabil drift til din virksomhed',
    descEn: 'Stable operations for your business',
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

// ─── Plan Card for Widget ─────────────────────────────────────────────

function WidgetPlanCard({
  plan,
  isDa,
  onSelect,
  isMobile,
}: {
  plan: Plan;
  isDa: boolean;
  onSelect: (plan: Plan) => void;
  isMobile?: boolean;
}) {
  const isPopular = plan.popular;

  return (
    <div
      className={`relative flex flex-col items-center text-center
        rounded-2xl cursor-pointer group
        transition-all duration-300 hover:scale-[1.02] hover:shadow-lg
        ${isMobile
          ? 'w-[85vw] max-w-[340px] p-5'
          : 'p-4 sm:p-5'
        }
        ${isPopular
          ? 'bg-[#112240]/80 border-2 border-[#f59e0b]/80 dark:border-[#f59e0b]/60 ring-1 ring-[#f59e0b]/20 shadow-lg shadow-[#f59e0b]/5'
          : 'bg-[#0e1f3d]/80 border border-[#1e3a5f]/60 dark:border-[#1a2d4d]/40 hover:border-[#2dd4bf]/40'
        }`}
      onClick={() => onSelect(plan)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(plan); }}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-[#f59e0b] text-white shadow-sm shadow-[#f59e0b]/30 whitespace-nowrap ${isMobile ? 'text-[11px]' : 'text-[10px] sm:text-xs'}`}>
            <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            {isDa ? plan.badgeDa : plan.badgeEn}
          </span>
        </div>
      )}

      {/* Icon */}
      <div className={`rounded-xl flex items-center justify-center mb-3 ${isMobile ? 'h-12 w-12' : 'h-10 w-10 sm:h-12 sm:w-12'}
        ${isPopular ? 'bg-[#f59e0b]/10' : 'bg-[#2dd4bf]/10'}`}
      >
        {isPopular ? (
          <ShieldCheck className={`text-[#f59e0b] ${isMobile ? 'h-6 w-6' : 'h-5 w-5 sm:h-6 sm:w-6'}`} />
        ) : (
          <Lock className={`text-[#2dd4bf] ${isMobile ? 'h-6 w-6' : 'h-5 w-5 sm:h-6 sm:w-6'}`} />
        )}
      </div>

      {/* Plan name */}
      <p className={`font-bold uppercase tracking-wider mb-1.5
        ${isMobile ? 'text-sm' : 'text-xs sm:text-sm'}
        ${isPopular ? 'text-[#f59e0b]' : 'text-[#2dd4bf]'}`}
      >
        {plan.name}
      </p>

      {/* Price */}
      <p className={`font-bold text-white tracking-tight leading-none ${isMobile ? 'text-3xl' : 'text-xl sm:text-2xl'}`}>
        {isDa ? plan.priceDa : plan.priceEn}
      </p>
      {plan.priceUnitDa && (
        <p className={`text-white/35 mt-0.5 ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs'}`}>
          {isDa ? plan.priceUnitDa : plan.priceUnitEn}
        </p>
      )}

      {/* Features */}
      <ul className={`flex-1 text-left w-full ${isMobile ? 'mt-3 space-y-2' : 'mt-2 sm:mt-2.5 space-y-1'}`}>
        {plan.features.map((feat, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className={`shrink-0 mt-0.5 ${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'}
              ${isPopular ? 'text-[#f59e0b]/80' : 'text-[#2dd4bf]/80'}`}
            />
            <span className={`text-white/55 leading-snug ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs'}`}>
              {isDa ? feat.da : feat.en}
            </span>
          </li>
        ))}
      </ul>

      {/* Savings */}
      {plan.savingsDa && (
        <div className="mt-2">
          <span className={`font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs'}`}>
            {isDa ? plan.savingsDa : plan.savingsEn}
          </span>
        </div>
      )}

      {/* Binding */}
      <p className={`text-white/30 ${isMobile ? 'mt-2.5 text-xs' : 'mt-2 text-[10px]'}`}>
        {isDa ? `Binding: ${plan.bindDa}` : `Commitment: ${plan.bindEn}`}
      </p>

      {/* CTA */}
      <button
        type="button"
        className={`mt-auto w-full flex items-center justify-center gap-2
          rounded-xl font-semibold
          transition-all duration-200 hover:shadow-md active:scale-[0.97]
          ${isMobile ? 'h-12 text-sm mt-3' : 'h-10 sm:h-11 px-3 sm:px-4 text-xs sm:text-sm'}
          ${isPopular
            ? 'bg-[#f59e0b] hover:bg-[#d97706] text-white shadow-[#f59e0b]/20'
            : 'bg-[#0d9488]/80 hover:bg-[#0d9488] text-white/90 hover:text-white border border-[#0d9488]/40'
          }`}
      >
        <span>{isDa ? plan.ctaDa : plan.ctaEn}</span>
        <ArrowRight className={`opacity-70 group-hover:opacity-100 transition-opacity ${isMobile ? 'h-4 w-4' : 'h-3 w-3 sm:h-3.5 sm:w-3.5'}`} />
      </button>
    </div>
  );
}

// ─── Mobile Carousel for Widget ───────────────────────────────────────

function WidgetCarousel({
  plans,
  isDa,
  onSelect,
}: {
  plans: Plan[];
  isDa: boolean;
  onSelect: (plan: Plan) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
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

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    handleScroll();
  }, [handleScroll]);

  return (
    <div className="flex flex-col">
      <div className="relative">
        {activeIndex > 0 && (
          <button
            type="button"
            onClick={() => scrollToSlide(activeIndex - 1)}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-[#0e1f3d]/90 border border-white/10 text-white/70 hover:text-white hover:bg-[#0e1f3d] backdrop-blur-sm transition-all shadow-lg"
            aria-label="Previous plan"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div
          ref={setScrollRef}
          onScroll={handleScroll}
          onTouchStart={() => { isDragging.current = true; }}
          onTouchEnd={handleTouchEnd}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-6 py-2
            -mx-6 scrollbar-hide"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {plans.map((plan) => (
            <div key={plan.id} className="snap-center shrink-0 flex items-center">
              <WidgetPlanCard plan={plan} isDa={isDa} onSelect={onSelect} isMobile />
            </div>
          ))}
        </div>

        {activeIndex < plans.length - 1 && (
          <button
            type="button"
            onClick={() => scrollToSlide(activeIndex + 1)}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-[#0e1f3d]/90 border border-white/10 text-white/70 hover:text-white hover:bg-[#0e1f3d] backdrop-blur-sm transition-all shadow-lg"
            aria-label="Next plan"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2 py-2.5">
        {plans.map((plan, i) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => scrollToSlide(i)}
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
    </div>
  );
}

// ─── Main Widget Component ────────────────────────────────────────────

export function SubscriptionPlansWidget() {
  const { language } = useTranslation();
  const isDa = language === 'da';

  const handleSelectPlan = useCallback((_plan: Plan) => {
    const targetSearch = '?tab=access';
    window.history.pushState({ view: 'settings' }, '', `/settings${targetSearch}`);
    window.dispatchEvent(new CustomEvent('app:navigate', {
      detail: { view: 'settings', search: targetSearch },
    }));
  }, []);

  const t = (da: string, en: string) => (isDa ? da : en);

  return (
    <div
      className="relative overflow-hidden rounded-2xl lg:rounded-[1.25rem]
        bg-[#0c1a33] dark:bg-[#091325] border border-[#1a2d4d]/60 dark:border-[#152240]/80
        animate-fade-in flex flex-col min-h-[calc(100dvh-4rem)]"
    >
      {/* Background dot grid */}
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Decorative glow orbs */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[#0d9488]/[0.07] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-[#2dd4bf]/[0.05] blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative pt-5 sm:pt-8 pb-3 sm:pb-5 px-5 sm:px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-[#2dd4bf] text-xs font-medium tracking-widest uppercase opacity-80">
            .TBKEY
          </span>
        </div>
        <h2 className={`font-bold text-white tracking-tight ${'text-lg sm:text-xl'}`}>
          {t('Vælg Din Plan', 'Choose Your Plan')}
        </h2>
        <p className={`text-white/50 max-w-md mx-auto leading-relaxed ${'mt-1.5 text-xs sm:text-sm'}`}>
          {t(
            'Få fuld skrivetilladelse med et krypteret escrow-bevis',
            'Get full write access with an encrypted escrow proof',
          )}
        </p>
      </div>

      {/* Plan cards */}
      <div className="relative px-2 sm:px-5 pb-4 sm:pb-8 flex-1 flex flex-col justify-center">
        {/* Mobile: Carousel */}
        <div className="sm:hidden">
          <WidgetCarousel plans={PLANS} isDa={isDa} onSelect={handleSelectPlan} />
        </div>

        {/* Tablet & Desktop: Grid */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 auto-rows-fr">
            {PLANS.map((plan) => (
              <WidgetPlanCard
                key={plan.id}
                plan={plan}
                isDa={isDa}
                onSelect={handleSelectPlan}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom info bar */}
      <div className="flex items-center justify-center gap-2 text-white/30 text-[10px] sm:text-xs tracking-wider pb-2 sm:pb-0">
        <Lock className="h-3 w-3" />
        <span>WEB ACCESS PROOF &middot; .TBKEY</span>
        <Lock className="h-3 w-3" />
      </div>
    </div>
  );
}
