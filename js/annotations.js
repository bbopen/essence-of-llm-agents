/**
 * Code Annotations - Interactive Marginalia
 *
 * Keyboard-driven navigation through code annotations.
 * Treats code examples like scholarly texts with expert commentary.
 */

(function() {
  'use strict';

  // ==========================================================================
  // State
  // ==========================================================================

  let activeAnnotation = null;
  let expandedAnnotation = null;
  let annotations = [];
  let markers = [];
  let notes = [];
  let annotationMode = false;

  // ==========================================================================
  // Initialization
  // ==========================================================================

  function init() {
    // Find all annotated code blocks
    const annotatedBlocks = document.querySelectorAll('.annotated-code');

    if (annotatedBlocks.length === 0) return;

    annotatedBlocks.forEach(block => {
      setupAnnotatedBlock(block);
    });

    // Global keyboard handler
    document.addEventListener('keydown', handleKeydown);

    // Click outside to deactivate
    document.addEventListener('click', handleClickOutside);
  }

  function setupAnnotatedBlock(block) {
    const blockMarkers = block.querySelectorAll('.annotation-marker');
    const blockNotes = block.querySelectorAll('.annotation-note');
    const hints = document.getElementById('annotation-hints');

    // Show hints when hovering over annotated block
    if (hints) {
      block.addEventListener('mouseenter', () => {
        hints.classList.add('annotation-hints--visible');
      });
      block.addEventListener('mouseleave', () => {
        if (!annotationMode) {
          hints.classList.remove('annotation-hints--visible');
        }
      });
    }

    // Store references
    blockMarkers.forEach((marker, index) => {
      marker.dataset.annotationIndex = index;
      markers.push(marker);

      // Click handler for markers
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        activateAnnotation(index);
      });

      // Make focusable
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('role', 'button');
      marker.setAttribute('aria-label', `Annotation ${index + 1}`);
    });

    blockNotes.forEach((note, index) => {
      note.dataset.annotationIndex = index;
      notes.push(note);

      // Store associated line elements
      const lineIds = note.dataset.lines?.split(',') || [];
      note._associatedLines = lineIds.map(id =>
        block.querySelector(`[data-line="${id.trim()}"]`)
      ).filter(Boolean);

      // Click handler for notes
      note.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeAnnotation === index) {
          toggleExpand(index);
        } else {
          activateAnnotation(index);
        }
      });

      // Make focusable
      note.setAttribute('tabindex', '0');
      note.setAttribute('role', 'button');
      note.setAttribute('aria-expanded', 'false');
    });

    annotations = markers.map((marker, i) => ({
      marker,
      note: notes[i],
      index: i
    }));
  }

  // ==========================================================================
  // Annotation Activation
  // ==========================================================================

  function activateAnnotation(index) {
    if (index < 0 || index >= annotations.length) return;

    // Deactivate previous
    if (activeAnnotation !== null) {
      deactivateAnnotation(activeAnnotation);
    }

    activeAnnotation = index;
    annotationMode = true;

    const { marker, note } = annotations[index];

    // Activate marker
    marker.classList.add('annotation-marker--active');

    // Activate note
    note.classList.add('annotation-note--active');
    note.setAttribute('aria-expanded', expandedAnnotation === index ? 'true' : 'false');

    // Highlight associated lines
    if (note._associatedLines) {
      note._associatedLines.forEach(line => {
        if (line) line.classList.add('annotated-code__line--highlighted');
      });
    }

    // Scroll note into view if needed
    scrollIntoViewIfNeeded(note);

    // Announce for screen readers
    announceForScreenReader(`Annotation ${index + 1} of ${annotations.length}`);
  }

  function deactivateAnnotation(index) {
    if (index === null || !annotations[index]) return;

    const { marker, note } = annotations[index];

    marker.classList.remove('annotation-marker--active');
    note.classList.remove('annotation-note--active');

    // Remove line highlights
    if (note._associatedLines) {
      note._associatedLines.forEach(line => {
        if (line) line.classList.remove('annotated-code__line--highlighted');
      });
    }

    // Collapse if expanded
    if (expandedAnnotation === index) {
      collapseAnnotation(index);
    }
  }

  function deactivateAll() {
    if (activeAnnotation !== null) {
      deactivateAnnotation(activeAnnotation);
    }
    activeAnnotation = null;
    annotationMode = false;

    // Hide annotation hints
    const hints = document.getElementById('annotation-hints');
    if (hints) {
      hints.classList.remove('annotation-hints--visible');
    }
  }

  // ==========================================================================
  // Expand/Collapse
  // ==========================================================================

  function toggleExpand(index) {
    if (expandedAnnotation === index) {
      collapseAnnotation(index);
    } else {
      expandAnnotation(index);
    }
  }

  function expandAnnotation(index) {
    // Collapse any previously expanded
    if (expandedAnnotation !== null && expandedAnnotation !== index) {
      collapseAnnotation(expandedAnnotation);
    }

    const { note } = annotations[index];
    note.classList.add('annotation-note--expanded');
    note.setAttribute('aria-expanded', 'true');
    expandedAnnotation = index;

    announceForScreenReader('Annotation expanded');
  }

  function collapseAnnotation(index) {
    const { note } = annotations[index];
    note.classList.remove('annotation-note--expanded');
    note.setAttribute('aria-expanded', 'false');

    if (expandedAnnotation === index) {
      expandedAnnotation = null;
    }
  }

  // ==========================================================================
  // Keyboard Navigation
  // ==========================================================================

  function handleKeydown(event) {
    // Don't interfere with typing in inputs
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    // Check if we're in an annotated code section
    const inAnnotatedSection = isInAnnotatedSection();

    switch (event.key) {
      case 'n':
        // Next annotation (only if in annotation mode or in annotated section)
        if (annotationMode || inAnnotatedSection) {
          event.preventDefault();
          navigateAnnotation(1);
        }
        break;

      case 'p':
        // Previous annotation
        if (annotationMode || inAnnotatedSection) {
          event.preventDefault();
          navigateAnnotation(-1);
        }
        break;

      case 'Enter':
        // Expand/collapse current annotation
        if (activeAnnotation !== null) {
          event.preventDefault();
          toggleExpand(activeAnnotation);
        }
        break;

      case 'Escape':
        // Exit annotation mode
        if (annotationMode) {
          event.preventDefault();
          deactivateAll();
        }
        break;

      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        // Jump to annotation by number (when in annotated section)
        if (inAnnotatedSection && !event.metaKey && !event.ctrlKey) {
          const num = parseInt(event.key, 10) - 1;
          if (num < annotations.length) {
            event.preventDefault();
            activateAnnotation(num);
          }
        }
        break;
    }
  }

  function navigateAnnotation(direction) {
    if (annotations.length === 0) return;

    let newIndex;

    if (activeAnnotation === null) {
      // Start from first or last depending on direction
      newIndex = direction > 0 ? 0 : annotations.length - 1;
    } else {
      newIndex = activeAnnotation + direction;

      // Wrap around
      if (newIndex < 0) {
        newIndex = annotations.length - 1;
      } else if (newIndex >= annotations.length) {
        newIndex = 0;
      }
    }

    activateAnnotation(newIndex);
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  function handleClickOutside(event) {
    if (!event.target.closest('.annotated-code')) {
      deactivateAll();
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  function isInAnnotatedSection() {
    // Check if the current visible section has annotated code
    const sections = document.querySelectorAll('.section');
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
        return section.querySelector('.annotated-code') !== null;
      }
    }
    return false;
  }

  function scrollIntoViewIfNeeded(element) {
    const rect = element.getBoundingClientRect();
    const isVisible = (
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight
    );

    if (!isVisible) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  function announceForScreenReader(message) {
    let announcer = document.getElementById('sr-announcer');

    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'sr-announcer';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(announcer);
    }

    announcer.textContent = message;
  }

  // ==========================================================================
  // Start
  // ==========================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
