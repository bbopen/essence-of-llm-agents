/**
 * Production Agent Guide - Navigation
 *
 * Keyboard navigation and scroll-snap interactions
 * Adapted from thewayofcode.com interaction patterns
 */

(function() {
  'use strict';

  // ==========================================================================
  // State
  // ==========================================================================

  let currentSection = 0;
  let sections = [];
  let sidebarLinks = [];
  let isScrolling = false;

  // ==========================================================================
  // Initialization
  // ==========================================================================

  function init() {
    sections = Array.from(document.querySelectorAll('.section'));
    sidebarLinks = Array.from(document.querySelectorAll('.sidebar-link'));

    if (sections.length === 0) return;

    // Scale sections to fit viewport
    scaleSectionsToFit();

    // Set up event listeners
    setupKeyboardNavigation();
    setupScrollObserver();
    setupSidebarNavigation();

    // Initial state
    updateActiveSection(0);
    markVisibleSections();

    // Re-scale on resize
    window.addEventListener('resize', debounce(scaleSectionsToFit, 250));
  }

  // ==========================================================================
  // Content Scaling
  // ==========================================================================

  function scaleSectionsToFit() {
    // Scaling has been disabled - let CSS handle layout naturally.
    // The previous scaling approach was breaking grid layouts in annotated sections.
    // Sections use CSS scroll-snap and flexbox for centering.

    sections.forEach((section) => {
      // Remove any previously created wrappers
      const existingWrapper = section.querySelector('.section-content-wrapper');
      if (existingWrapper) {
        // Move children back out
        while (existingWrapper.firstChild) {
          section.insertBefore(existingWrapper.firstChild, existingWrapper);
        }
        existingWrapper.remove();
      }

      // Reset any inline styles that might have been applied
      section.style.overflow = '';
      section.style.height = '';
      section.style.maxHeight = '';
    });
  }

  function debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ==========================================================================
  // Keyboard Navigation
  // ==========================================================================

  function setupKeyboardNavigation() {
    document.addEventListener('keydown', handleKeydown);
  }

  function handleKeydown(event) {
    // Ignore if typing in an input
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'j':
      case ' ':
        event.preventDefault();
        navigateToSection(currentSection + 1);
        break;

      case 'ArrowUp':
      case 'k':
        event.preventDefault();
        navigateToSection(currentSection - 1);
        break;

      case 'Home':
        event.preventDefault();
        navigateToSection(0);
        break;

      case 'End':
        event.preventDefault();
        navigateToSection(sections.length - 1);
        break;

      // Number keys (0-9) for direct chapter navigation
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        const num = parseInt(event.key, 10);
        if (num < sections.length) {
          event.preventDefault();
          navigateToSection(num);
        }
        break;

      case 'r':
        // Random chapter (for exploration)
        event.preventDefault();
        const randomIndex = Math.floor(Math.random() * sections.length);
        navigateToSection(randomIndex);
        break;
    }
  }

  function navigateToSection(index) {
    if (index < 0 || index >= sections.length || isScrolling) return;

    isScrolling = true;
    currentSection = index;

    // Mark section visible immediately for fade-in animation
    sections[index].classList.add('visible');

    // Temporarily disable scroll-snap during navigation to prevent interference
    const html = document.documentElement;
    const originalSnapType = html.style.scrollSnapType;
    html.style.scrollSnapType = 'none';

    sections[index].scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    updateActiveSection(index);

    // Re-enable scroll-snap after animation completes
    setTimeout(() => {
      html.style.scrollSnapType = originalSnapType || '';
      isScrolling = false;
    }, 800);
  }

  // ==========================================================================
  // Scroll Observer
  // ==========================================================================

  function setupScrollObserver() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Use lower threshold for active section detection
          // This handles sections taller than the viewport
          if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
            const index = sections.indexOf(entry.target);
            if (index !== -1 && index !== currentSection) {
              currentSection = index;
              updateActiveSection(index);
            }
          }

          // Mark section as visible for fade-in animation (any intersection)
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      {
        threshold: [0.1, 0.5],
        rootMargin: '0px'
      }
    );

    sections.forEach((section) => observer.observe(section));
  }

  function markVisibleSections() {
    // Mark initially visible sections
    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < window.innerHeight) {
        section.classList.add('visible');
      }
    });
  }

  // ==========================================================================
  // Sidebar Navigation
  // ==========================================================================

  function setupSidebarNavigation() {
    sidebarLinks.forEach((link, index) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigateToSection(index);
      });
    });
  }

  function updateActiveSection(index) {
    // Update sidebar links
    sidebarLinks.forEach((link, i) => {
      link.classList.toggle('active', i === index);
    });

    // Update URL hash without triggering scroll
    const sectionId = sections[index]?.id;
    if (sectionId && history.replaceState) {
      history.replaceState(null, '', `#${sectionId}`);
    }
  }

  // ==========================================================================
  // Handle Initial Hash
  // ==========================================================================

  function handleInitialHash() {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const targetSection = sections.findIndex((s) => s.id === hash);
      if (targetSection !== -1) {
        // Delay to ensure page has loaded
        setTimeout(() => navigateToSection(targetSection), 100);
      }
    }
  }

  // ==========================================================================
  // Start
  // ==========================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      handleInitialHash();
    });
  } else {
    init();
    handleInitialHash();
  }
})();
