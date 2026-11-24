"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  KLE_LOGO_PUBLIC_PATH,
  KLE_LOGO_TRANSPARENT_PUBLIC_PATH,
  KLE_LOGO_DATA_URL,
  KLE_LOGO_TRANSPARENT_DATA_URL,
  KLE_LOGO_ASPECT_RATIO,
} from "../../assets/brandLogoData";

export {
  KLE_LOGO_PUBLIC_PATH,
  KLE_LOGO_TRANSPARENT_PUBLIC_PATH,
  KLE_LOGO_DATA_URL,
  KLE_LOGO_TRANSPARENT_DATA_URL,
  KLE_LOGO_ASPECT_RATIO,
};

export type BrandLogoSize = "xs" | "sm" | "md" | "lg" | "xl" | "custom";
export type BrandLogoVariant = "standard" | "transparent" | "on-dark" | "pill";

export interface BrandLogoProps {
  /** Size preset for height & proportional width */
  size?: BrandLogoSize;
  /** Visual variant: standard (light bg), transparent, on-dark (for dark headers/sidebars) */
  variant?: BrandLogoVariant;
  /** Custom className for the container */
  className?: string;
  /** Optional custom height (in pixels or rem) */
  height?: number;
  /** Custom inline styles */
  style?: React.CSSProperties;
  /** Display accompanying institutional subtitle */
  subtitle?: string;
  /** Whether to show text alongside the logo */
  showSubtitle?: boolean;
  /** Force fallback state (for testing or missing assets) */
  forceFallback?: boolean;
  /** Click handler if clickable */
  onClick?: () => void;
  /** Accessible label */
  alt?: string;
}

const SIZE_MAP: Record<Exclude<BrandLogoSize, "custom">, { height: number; width: number; containerClass: string }> = {
  xs: { height: 20, width: 100, containerClass: "h-5" },
  sm: { height: 26, width: 130, containerClass: "h-6.5" },
  md: { height: 32, width: 160, containerClass: "h-8" },
  lg: { height: 40, width: 200, containerClass: "h-10" },
  xl: { height: 50, width: 250, containerClass: "h-12.5" },
};

/**
 * BrandLogo — Central Official Brand Component for KLE Technological University.
 *
 * Discovers the official authentic 624x125 PNG logo, preserves strict aspect ratio
 * and transparency, and falls back to a clean institutional monogram slot if missing.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = "md",
  variant = "standard",
  className = "",
  height,
  style,
  subtitle,
  showSubtitle = false,
  forceFallback = false,
  onClick,
  alt = "KLE Technological University",
}) => {
  const [loadError, setLoadError] = useState(false);
  const [candidateIndex, setCandidateIndex] = useState(0);

  // Asset discovery candidate paths in order of preference
  const isDark = variant === "on-dark";
  const candidateUrls = [
    isDark ? KLE_LOGO_TRANSPARENT_PUBLIC_PATH : KLE_LOGO_PUBLIC_PATH,
    KLE_LOGO_PUBLIC_PATH,
    "/brand/kle-logo.png",
    "/brand/kletech-logo.png",
    "/kletech-logo.png",
  ];

  const currentSrc = candidateUrls[candidateIndex] || KLE_LOGO_PUBLIC_PATH;

  const handleImgError = () => {
    if (candidateIndex + 1 < candidateUrls.length) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      setLoadError(true);
    }
  };

  const dimensions = size === "custom"
    ? { height: height || 32, width: Math.round((height || 32) * KLE_LOGO_ASPECT_RATIO), containerClass: "" }
    : SIZE_MAP[size];

  const targetHeight = height || dimensions.height;
  const targetWidth = Math.round(targetHeight * KLE_LOGO_ASPECT_RATIO);

  // If forced or failed, render the clean reserved institutional slot
  if (forceFallback || loadError) {
    return (
      <div
        className={`inline-flex items-center gap-2.5 select-none ${className}`}
        style={style}
        onClick={onClick}
        role="img"
        aria-label={alt}
      >
        <div
          className={`flex items-center justify-center font-bold tracking-tight rounded-lg shrink-0 ${
            isDark
              ? "bg-[#173B30] text-[#D6EBDD] border border-white/20"
              : "bg-[#1F4D3F] text-white shadow-xs"
          }`}
          style={{ height: targetHeight, width: targetHeight }}
        >
          <span className="font-mono text-xs font-bold leading-none">KLE</span>
        </div>
        <div className="flex flex-col justify-center min-w-0">
          <span
            className={`font-semibold tracking-tight leading-none text-xs ${
              isDark ? "text-white" : "text-[#10251F]"
            }`}
          >
            KLE Technological University
          </span>
          {(showSubtitle || subtitle) && (
            <span
              className={`text-[10px] mt-0.5 leading-none truncate ${
                isDark ? "text-white/70" : "text-[#5B6B66]"
              }`}
            >
              {subtitle || "Examination Portal"}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Wrapper styling for variants
  const getVariantWrapperClass = () => {
    switch (variant) {
      case "on-dark":
        return "bg-white/95 backdrop-blur-xs p-1 rounded-md shadow-xs border border-white/20";
      case "pill":
        return "bg-white px-2.5 py-1 rounded-full shadow-xs border border-[#E3EAE6]";
      default:
        return "";
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-3 select-none ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={style}
      onClick={onClick}
    >
      <div className={`relative flex items-center shrink-0 ${getVariantWrapperClass()}`}>
        {/*
          Using standard HTML img with onError cascade ensures rock-solid local fallback
          and prevents Next.js image optimizer failures in containerized/headless environments.
        */}
        <img
          src={currentSrc}
          alt={alt}
          onError={handleImgError}
          className="object-contain block max-w-full"
          style={{
            height: `${targetHeight}px`,
            width: "auto",
            aspectRatio: "624 / 125",
          }}
          loading="eager"
        />
      </div>

      {(showSubtitle || subtitle) && (
        <div className="hidden sm:flex flex-col justify-center border-l border-current/20 pl-2.5 min-w-0">
          <span
            className={`font-semibold text-xs leading-none truncate ${
              isDark ? "text-white" : "text-[#10251F]"
            }`}
          >
            {subtitle || "Examination Portal"}
          </span>
          <span
            className={`text-[9px] mt-0.5 font-mono uppercase tracking-wider ${
              isDark ? "text-white/60" : "text-[#5B6B66]"
            }`}
          >
            Hubballi, Karnataka
          </span>
        </div>
      )}
    </div>
  );
};

export default BrandLogo;
