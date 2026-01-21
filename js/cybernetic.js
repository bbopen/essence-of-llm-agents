/**
 * Production Agent Guide - Cybernetic Interactions
 *
 * Smooth scroll reveals, navigation state, and
 * the eternal loop indicator animation.
 */

(function() {
  'use strict';

  // ==========================================================================
  // State
  // ==========================================================================

  let sections = [];
  let navLinks = [];
  let currentSection = 0;

  // ==========================================================================
  // Initialization
  // ==========================================================================

  function init() {
    sections = Array.from(document.querySelectorAll('.section'));
    navLinks = Array.from(document.querySelectorAll('.nav-link'));

    if (sections.length === 0) return;

    setupScrollObserver();
    setupNavigation();
    setupKeyboardNav();
    handleInitialHash();

    // Mark hero as visible immediately
    const hero = document.querySelector('.section--hero');
    if (hero) {
      hero.classList.add('visible');
    }
  }

  // ==========================================================================
  // Scroll Observer - Reveal on Scroll
  // ==========================================================================

  function setupScrollObserver() {
    const observerOptions = {
      root: null,
      rootMargin: '-10% 0px -10% 0px',
      threshold: [0, 0.1, 0.5]
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        // Reveal animation
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');

          // Update current section for nav
          const index = sections.indexOf(entry.target);
          if (index !== -1 && entry.intersectionRatio > 0.1) {
            updateActiveNav(index);
          }
        }
      });
    }, observerOptions);

    sections.forEach((section) => observer.observe(section));
  }

  // ==========================================================================
  // Navigation
  // ==========================================================================

  function setupNavigation() {
    navLinks.forEach((link, index) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToSection(index);
      });
    });
  }

  function updateActiveNav(index) {
    if (index === currentSection) return;
    currentSection = index;

    navLinks.forEach((link, i) => {
      link.classList.toggle('active', i === index);
    });

    // Update URL hash without scroll
    const sectionId = sections[index]?.id;
    if (sectionId && history.replaceState) {
      history.replaceState(null, '', `#${sectionId}`);
    }
  }

  function navigateToSection(index) {
    if (index < 0 || index >= sections.length) return;

    sections[index].scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    updateActiveNav(index);
  }

  // ==========================================================================
  // Keyboard Navigation
  // ==========================================================================

  function setupKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      // Ignore if in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          navigateToSection(currentSection + 1);
          break;

        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          navigateToSection(currentSection - 1);
          break;

        case 'Home':
          e.preventDefault();
          navigateToSection(0);
          break;

        case 'End':
          e.preventDefault();
          navigateToSection(sections.length - 1);
          break;

        // Number keys for direct navigation
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
          const num = parseInt(e.key, 10);
          if (num < sections.length) {
            e.preventDefault();
            navigateToSection(num);
          }
          break;
      }
    });
  }

  // ==========================================================================
  // Hash Handling
  // ==========================================================================

  function handleInitialHash() {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const targetIndex = sections.findIndex((s) => s.id === hash);
      if (targetIndex !== -1) {
        // Small delay for page load
        setTimeout(() => {
          navigateToSection(targetIndex);
        }, 100);
      }
    }
  }

  // ==========================================================================
  // Loop Indicator Enhancement
  // ==========================================================================

  function setupLoopIndicator() {
    const indicator = document.querySelector('.loop-indicator');
    if (!indicator) return;

    // Subtle parallax on scroll
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const rotation = (scrollY * 0.1) % 360;
          indicator.style.transform = `rotate(${rotation}deg)`;
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ==========================================================================
  // Code Block Interactions
  // ==========================================================================

  function setupCodeBlocks() {
    const codeBlocks = document.querySelectorAll('.code-block');

    codeBlocks.forEach((block) => {
      // Add line numbers if not present
      const pre = block.querySelector('pre');
      if (pre && !block.querySelector('.line-numbers')) {
        const lines = pre.querySelectorAll('.line');
        if (lines.length > 0) {
          // Lines already exist, just ensure proper structure
          return;
        }

        // If no .line spans, wrap each line
        const code = pre.querySelector('code');
        if (code) {
          const content = code.innerHTML;
          const lineArray = content.split('\n');
          code.innerHTML = lineArray
            .map((line) => `<span class="line">${line}</span>`)
            .join('\n');
        }
      }
    });
  }

  // ==========================================================================
  // Start
  // ==========================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      setupLoopIndicator();
      setupCodeBlocks();
    });
  } else {
    init();
    setupLoopIndicator();
    setupCodeBlocks();
  }

})();
