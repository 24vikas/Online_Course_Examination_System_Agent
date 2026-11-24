"use client";

import * as React from "react";
import { PanelLeft, X } from "lucide-react";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem"; // 256px
const SIDEBAR_WIDTH_COLLAPSED = "3.5rem"; // 56px

interface SidebarContextType {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean | ((value: boolean) => boolean)) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextType | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

export interface SidebarProviderProps extends React.ComponentProps<"div"> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const SidebarProvider = React.forwardRef<HTMLDivElement, SidebarProviderProps>(
  ({ defaultOpen = true, open: openProp, onOpenChange: setOpenProp, className = "", style, children, ...props }, ref) => {
    const [isMobile, setIsMobile] = React.useState(false);
    const [openMobile, setOpenMobile] = React.useState(false);
    const [_open, _setOpen] = React.useState(defaultOpen);

    const open = openProp ?? _open;
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        const openState = typeof value === "function" ? value(open) : value;
        if (setOpenProp) {
          setOpenProp(openState);
        } else {
          _setOpen(openState);
        }
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      },
      [setOpenProp, open]
    );

    // Responsive screen detection
    React.useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768);
      };
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Helper toggle
    const toggleSidebar = React.useCallback(() => {
      return isMobile ? setOpenMobile((prev) => !prev) : setOpen((prev) => !prev);
    }, [isMobile, setOpen]);

    // Keyboard shortcut (Cmd+B or Ctrl+B)
    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "b" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSidebar();
        }
        if (event.key === "Escape" && isMobile && openMobile) {
          setOpenMobile(false);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleSidebar, isMobile, openMobile]);

    const state = open ? "expanded" : "collapsed";

    const contextValue = React.useMemo<SidebarContextType>(
      () => ({
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, isMobile, openMobile, toggleSidebar]
    );

    return (
      <SidebarContext.Provider value={contextValue}>
        <div
          ref={ref}
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-collapsed": SIDEBAR_WIDTH_COLLAPSED,
              ...style,
            } as React.CSSProperties
          }
          className={`flex min-h-screen w-full ${className}`}
          {...props}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = "SidebarProvider";

export interface SidebarProps extends React.ComponentProps<"div"> {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}

export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  ({ collapsible = "icon", className = "", children, ...props }, ref) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    // 1. Mobile Sheet Drawer Mode
    if (isMobile) {
      if (!openMobile) return null;
      return (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            id="sidebar-backdrop-overlay"
            aria-hidden="true"
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setOpenMobile(false)}
          />
          {/* Slide-out Drawer */}
          <div
            ref={ref}
            className={`relative flex flex-col w-[260px] max-w-[85vw] h-full bg-white text-[#161616] border-r border-[#E6E4E4] shadow-2xl z-50 font-serif select-none ${className}`}
            {...props}
          >
            {children}
          </div>
        </div>
      );
    }

    // 2. Desktop Mode (Collapsible Rail: 256px <-> 56px)
    const isCollapsed = state === "collapsed" && collapsible === "icon";

    return (
      <div
        ref={ref}
        className={`group peer relative shrink-0 transition-[width] duration-200 ease-in-out select-none font-serif ${
          isCollapsed ? "w-[56px]" : "w-[256px]"
        }`}
      >
        <div
          className={`fixed inset-y-0 left-0 z-30 flex flex-col h-full bg-white text-[#161616] border-r border-[#E6E4E4] shadow-xs transition-[width] duration-200 ease-in-out ${
            isCollapsed ? "w-[56px]" : "w-[256px]"
          } ${className}`}
          {...props}
        >
          {children}
        </div>
      </div>
    );
  }
);
Sidebar.displayName = "Sidebar";

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className = "", ...props }, ref) => {
    const { state, isMobile } = useSidebar();
    const isCollapsed = !isMobile && state === "collapsed";
    return (
      <div
        ref={ref}
        className={`flex items-center shrink-0 border-b border-[#E6E4E4] transition-all duration-200 ${
          isCollapsed ? "h-[52px] justify-center px-2" : "h-[52px] justify-between px-3"
        } ${className}`}
        {...props}
      />
    );
  }
);
SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className = "", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-4 ${className}`}
        {...props}
      />
    );
  }
);
SidebarContent.displayName = "SidebarContent";

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className = "", ...props }, ref) => {
    return <div ref={ref} className={`px-2 space-y-1 ${className}`} {...props} />;
  }
);
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className = "", children, ...props }, ref) => {
    const { state, isMobile } = useSidebar();
    const isCollapsed = !isMobile && state === "collapsed";
    if (isCollapsed) return null;
    return (
      <div
        ref={ref}
        className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-[#686868] ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SidebarGroupLabel.displayName = "SidebarGroupLabel";

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className = "", ...props }, ref) => {
    return <ul ref={ref} className={`space-y-0.5 list-none m-0 p-0 ${className}`} {...props} />;
  }
);
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(
  ({ className = "", ...props }, ref) => {
    return <li ref={ref} className={`relative ${className}`} {...props} />;
  }
);
SidebarMenuItem.displayName = "SidebarMenuItem";

export interface SidebarMenuButtonProps extends React.ComponentProps<"button"> {
  isActive?: boolean;
  tooltip?: string;
  asChild?: boolean;
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ isActive = false, tooltip, className = "", children, ...props }, ref) => {
    const { state, isMobile } = useSidebar();
    const isCollapsed = !isMobile && state === "collapsed";

    return (
      <button
        ref={ref}
        title={isCollapsed ? tooltip : undefined}
        className={`group/btn relative w-full flex items-center gap-2.5 rounded-md text-xs transition-colors cursor-pointer outline-none ${
          isCollapsed ? "h-9 w-9 mx-auto justify-center p-0" : "px-2.5 py-2 text-left"
        } ${
          isActive
            ? "bg-[#981B2B]/10 text-[#981B2B] font-bold border-l-2 border-[#981B2B]"
            : "text-[#4A4A4A] hover:text-[#161616] hover:bg-[#F8F8F7]"
        } ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
SidebarMenuButton.displayName = "SidebarMenuButton";

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className = "", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`shrink-0 border-t border-[#E6E4E4] p-2 ${className}`}
        {...props}
      />
    );
  }
);
SidebarFooter.displayName = "SidebarFooter";

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  ({ className = "", ...props }, ref) => {
    const { toggleSidebar } = useSidebar();
    return (
      <button
        ref={ref}
        type="button"
        onClick={toggleSidebar}
        aria-label="Toggle Navigation Sidebar"
        className={`p-1.5 rounded-md text-[#686868] hover:text-[#161616] hover:bg-[#F8F8F7] transition-colors cursor-pointer ${className}`}
        {...props}
      >
        <PanelLeft className="w-4 h-4" />
      </button>
    );
  }
);
SidebarTrigger.displayName = "SidebarTrigger";

export const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  ({ className = "", ...props }, ref) => {
    const { toggleSidebar } = useSidebar();
    return (
      <button
        ref={ref}
        type="button"
        aria-label="Toggle Sidebar Rail"
        onClick={toggleSidebar}
        tabIndex={-1}
        className={`absolute inset-y-0 -right-1 w-2 cursor-col-resize hover:bg-[#981B2B]/20 transition-colors z-20 hidden md:block ${className}`}
        {...props}
      />
    );
  }
);
SidebarRail.displayName = "SidebarRail";
