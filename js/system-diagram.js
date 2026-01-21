/**
 * System Diagram - Core Loop with Infrastructure Layers
 *
 * "The loop is the architecture. Everything else is infrastructure."
 *
 * Visual concept: 4-step core loop at center, infrastructure rings orbiting around.
 * Scroll reveals: Core steps first, then inner ring, then outer ring, then ambient.
 */

(function() {
  'use strict';

  // The 4-step core loop - matches the guide exactly
  const CORE_STEPS = [
    {
      id: 'ask',
      label: 'ASK',
      node: 'ask',
      color: 'cyan',
      annotation: 'Request action from LLM',
      detail: 'The stochastic moment. Context flows in, the model decides.'
    },
    {
      id: 'check',
      label: 'CHECK',
      node: 'check',
      color: 'coral',
      annotation: 'Validate the action',
      detail: 'Safety layers verify: Layer 0 → 1 → 2. Lower overrides higher.'
    },
    {
      id: 'run',
      label: 'RUN',
      node: 'run',
      color: 'coral',
      annotation: 'Execute the tool',
      detail: 'Deterministic execution. Your code — predictable, testable.'
    },
    {
      id: 'see',
      label: 'SEE',
      node: 'see',
      color: 'gold',
      annotation: 'Observe the result',
      detail: 'Record the outcome. Result becomes context for next iteration.'
    }
  ];

  // Infrastructure layers that wrap the core
  const INFRA_INNER = [
    { id: 'tools', label: 'Tools', section: '02' },
    { id: 'validation', label: 'Validation', section: '03' },
    { id: 'state', label: 'State', section: '04' }
  ];

  const INFRA_OUTER = [
    { id: 'security', label: 'Security', section: '05' },
    { id: 'evaluation', label: 'Eval', section: '06' },
    { id: 'operations', label: 'Ops', section: '07' },
    { id: 'orchestration', label: 'Orch', section: '08' }
  ];

  // Which infrastructure elements relate to each core step
  const STEP_CONNECTIONS = {
    ask: ['tools', 'state'],
    check: ['validation', 'security'],
    run: ['tools', 'operations'],
    see: ['state', 'evaluation']
  };

  class SystemDiagram {
    constructor(container) {
      this.container = container;
      this.section = document.querySelector('#system');
      this.currentStep = -1;
      this.phase = 'idle'; // idle, core, inner, outer, ambient
      this.hasCompletedOnce = false;
      this.animationFrame = null;
      this.particles = [];

      this.init();
    }

    init() {
      this.render();
      this.cacheElements();
      this.createParticles();
      this.setupScrollObserver();
      this.animateParticles();
    }

    render() {
      this.container.innerHTML = `
        <div class="sd">
          <div class="sd__stage">
            <!-- Outer infrastructure ring -->
            <div class="sd__ring sd__ring--outer">
              <svg class="sd__ring-svg" viewBox="0 0 400 400">
                <circle class="sd__ring-track sd__ring-track--outer" cx="200" cy="200" r="185" />
              </svg>
              <div class="sd__ring-labels sd__ring-labels--outer">
                ${INFRA_OUTER.map((item, i) => {
                  const angle = (i * 90) - 45; // Position at 45, 135, 225, 315 degrees
                  return `<span class="sd__ring-label" data-infra="${item.id}" style="--angle: ${angle}deg">${item.label}</span>`;
                }).join('')}
              </div>
            </div>

            <!-- Inner infrastructure ring -->
            <div class="sd__ring sd__ring--inner">
              <svg class="sd__ring-svg" viewBox="0 0 400 400">
                <circle class="sd__ring-track sd__ring-track--inner" cx="200" cy="200" r="140" />
              </svg>
              <div class="sd__ring-labels sd__ring-labels--inner">
                ${INFRA_INNER.map((item, i) => {
                  const angle = (i * 120) - 90; // Position at -90, 30, 150 degrees (top, bottom-right, bottom-left)
                  return `<span class="sd__ring-label" data-infra="${item.id}" style="--angle: ${angle}deg">${item.label}</span>`;
                }).join('')}
              </div>
            </div>

            <!-- Connection lines from core to infrastructure -->
            <svg class="sd__radials" viewBox="0 0 500 500">
              <g class="sd__radial-lines"></g>
            </svg>

            <!-- Core diagram - the 4-step loop -->
            <div class="sd__core">
              <!-- Progress arc for core loop -->
              <svg class="sd__progress" viewBox="0 0 100 100">
                <circle class="sd__progress-track" cx="50" cy="50" r="42" />
                <circle class="sd__progress-fill" cx="50" cy="50" r="42" />
              </svg>

              <!-- Connection paths forming a diamond -->
              <svg class="sd__paths" viewBox="0 0 200 200">
                <path class="sd__path" data-from="ask" data-to="check"
                      d="M 100 20 L 180 100" />
                <path class="sd__path" data-from="check" data-to="run"
                      d="M 180 100 L 100 180" />
                <path class="sd__path" data-from="run" data-to="see"
                      d="M 100 180 L 20 100" />
                <path class="sd__path" data-from="see" data-to="ask"
                      d="M 20 100 L 100 20" />
              </svg>

              <!-- Particle canvas -->
              <canvas class="sd__particles"></canvas>

              <!-- Core nodes -->
              <div class="sd__nodes">
                <div class="sd__node" data-node="ask">
                  <div class="sd__node-ring"></div>
                  <div class="sd__node-core">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83m-8.48 8.48l-2.83 2.83m0-14.14l2.83 2.83m8.48 8.48l2.83 2.83"/>
                    </svg>
                  </div>
                </div>

                <div class="sd__node" data-node="check">
                  <div class="sd__node-ring"></div>
                  <div class="sd__node-core">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      <path d="M9 12l2 2 4-4"/>
                    </svg>
                  </div>
                </div>

                <div class="sd__node" data-node="run">
                  <div class="sd__node-ring"></div>
                  <div class="sd__node-core">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </div>
                </div>

                <div class="sd__node" data-node="see">
                  <div class="sd__node-ring"></div>
                  <div class="sd__node-core">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Center label for ambient mode -->
              <div class="sd__center-label">while(true)</div>
            </div>

            <!-- Step info panel - appears below core -->
            <div class="sd__info-panel">
              <div class="sd__info-label"></div>
              <div class="sd__info-text"></div>
            </div>
          </div>

          <!-- Scroll hint -->
          <div class="sd__scroll-hint">
            <span>Scroll to explore</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M19 12l-7 7-7-7"/>
            </svg>
          </div>

          <!-- Phase indicators -->
          <div class="sd__phase-indicator">
            <span class="sd__phase-dot" data-phase="core"></span>
            <span class="sd__phase-dot" data-phase="inner"></span>
            <span class="sd__phase-dot" data-phase="outer"></span>
          </div>

          <!-- Architecture quote -->
          <div class="sd__quote">
            <span>The loop is the architecture.</span>
            <span class="sd__quote-dim">Everything else is infrastructure.</span>
          </div>
        </div>
      `;
    }

    cacheElements() {
      this.root = this.container.querySelector('.sd');
      this.stage = this.container.querySelector('.sd__stage');
      this.core = this.container.querySelector('.sd__core');
      this.progressFill = this.container.querySelector('.sd__progress-fill');
      this.nodes = this.container.querySelectorAll('.sd__node');
      this.paths = this.container.querySelectorAll('.sd__path');
      this.canvas = this.container.querySelector('.sd__particles');
      this.ctx = this.canvas.getContext('2d');
      this.centerLabel = this.container.querySelector('.sd__center-label');
      this.scrollHint = this.container.querySelector('.sd__scroll-hint');
      this.infoPanel = this.container.querySelector('.sd__info-panel');
      this.infoLabel = this.container.querySelector('.sd__info-label');
      this.infoText = this.container.querySelector('.sd__info-text');
      this.innerRing = this.container.querySelector('.sd__ring--inner');
      this.outerRing = this.container.querySelector('.sd__ring--outer');
      this.phaseDots = this.container.querySelectorAll('.sd__phase-dot');
      this.quote = this.container.querySelector('.sd__quote');
      this.infraLabels = this.container.querySelectorAll('.sd__ring-label');
      this.radialLines = this.container.querySelector('.sd__radial-lines');
    }

    createParticles() {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      this.particles = [];
      for (let i = 0; i < 20; i++) {
        this.particles.push({
          progress: Math.random(),
          speed: 0.002 + Math.random() * 0.003,
          size: 1.5 + Math.random() * 2,
          opacity: 0.3 + Math.random() * 0.4
        });
      }
    }

    setupScrollObserver() {
      if (!this.section) return;

      const updateStep = () => {
        const rect = this.section.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const stickyTop = viewportHeight * 0.12;
        const isStuck = rect.top <= stickyTop && rect.bottom > viewportHeight;
        const scrolledPast = rect.bottom <= viewportHeight && rect.top < 0;

        // If scrolled past the section, maintain ambient mode
        if (scrolledPast) {
          if (this.phase !== 'ambient' && this.hasCompletedOnce) {
            this.phase = 'ambient';
            this.enterAmbientMode();
          }
          return;
        }

        // If not yet stuck (above the section), reset to idle
        if (!isStuck) {
          if (this.phase !== 'idle') {
            this.phase = 'idle';
            this.currentStep = -1;
            this.clearAll();
          }
          return;
        }

        const scrollAmount = stickyTop - rect.top;
        const scrollableRange = rect.height - viewportHeight;
        const scrollProgress = Math.max(0, Math.min(1, scrollAmount / scrollableRange));

        // Phase boundaries
        // 0-60%: Core loop steps (4 steps)
        // 60-75%: Inner infrastructure ring
        // 75-90%: Outer infrastructure ring
        // 90-100%: Ambient mode

        const coreEnd = 0.55;
        const innerEnd = 0.70;
        const outerEnd = 0.85;

        if (scrollProgress < coreEnd) {
          // Core loop phase
          const coreProgress = scrollProgress / coreEnd;
          const newStep = Math.min(CORE_STEPS.length - 1, Math.floor(coreProgress * CORE_STEPS.length));

          if (this.phase !== 'core' || this.currentStep !== newStep) {
            this.phase = 'core';
            this.currentStep = newStep;
            this.setCoreStep(newStep);
          }
        } else if (scrollProgress < innerEnd) {
          // Inner infrastructure reveal
          if (this.phase !== 'inner') {
            this.phase = 'inner';
            this.currentStep = -1;
            this.showInnerRing();
          }
        } else if (scrollProgress < outerEnd) {
          // Outer infrastructure reveal
          if (this.phase !== 'outer') {
            this.phase = 'outer';
            this.currentStep = -1;
            this.showOuterRing();
            this.hasCompletedOnce = true;
          }
        } else {
          // Ambient mode
          if (this.phase !== 'ambient') {
            this.phase = 'ambient';
            this.enterAmbientMode();
          }
        }

        this.updatePhaseIndicator();
      };

      window.addEventListener('scroll', updateStep, { passive: true });
      updateStep();
    }

    setCoreStep(index) {
      const step = CORE_STEPS[index];
      if (!step) return;

      this.root.dataset.phase = 'core';
      this.root.dataset.step = index;
      this.root.dataset.color = step.color;

      // Update progress arc (circumference ≈ 264 for r=42)
      const progress = ((index + 1) / CORE_STEPS.length) * 264;
      this.progressFill.style.strokeDashoffset = 264 - progress;

      // Hide scroll hint after first interaction
      this.scrollHint.style.opacity = index > 0 ? '0' : '1';

      // Update info panel
      this.infoLabel.textContent = step.label;
      this.infoText.textContent = step.annotation;
      this.infoPanel.classList.add('is-visible');
      this.infoPanel.dataset.color = step.color;

      // Update nodes
      this.nodes.forEach(node => {
        const isActive = node.dataset.node === step.node;
        node.classList.toggle('is-active', isActive);
      });

      // Update paths - highlight the path TO the current node
      this.paths.forEach(path => {
        const isActive = path.dataset.to === step.node;
        path.classList.toggle('is-active', isActive);
      });

      // Show rings dimly during core phase to provide context
      this.innerRing.classList.add('is-visible', 'is-dim');
      this.outerRing.classList.add('is-visible', 'is-dim');
      this.quote.classList.remove('is-visible');

      // Highlight related infrastructure labels
      const relatedInfra = STEP_CONNECTIONS[step.id] || [];
      this.infraLabels.forEach(label => {
        const infraId = label.dataset.infra;
        const isConnected = relatedInfra.includes(infraId);
        label.classList.toggle('is-connected', isConnected);
      });

      // Draw radial connection lines
      this.drawRadialLines(step.id, step.color);
    }

    showInnerRing() {
      this.root.dataset.phase = 'inner';
      this.root.removeAttribute('data-step');
      this.root.dataset.color = 'gold';

      // Show complete loop
      this.progressFill.style.strokeDashoffset = 0;

      // Clear active states, show all nodes dimly
      this.nodes.forEach(node => {
        node.classList.remove('is-active');
        node.classList.add('is-complete');
      });
      this.paths.forEach(path => {
        path.classList.remove('is-active');
        path.classList.add('is-complete');
      });

      // Update info panel
      this.infoLabel.textContent = 'INFRASTRUCTURE';
      this.infoText.textContent = 'Tools, Validation, and State wrap the core loop';
      this.infoPanel.dataset.color = 'gold';

      // Reveal inner ring fully (remove dim)
      this.innerRing.classList.add('is-visible');
      this.innerRing.classList.remove('is-dim');
      this.outerRing.classList.remove('is-visible', 'is-dim');
      this.scrollHint.style.opacity = '0';
      this.centerLabel.style.opacity = '0';
      this.centerLabel.style.visibility = 'hidden';
      this.root.classList.remove('is-ambient');

      // Clear infrastructure highlights and radial lines
      this.infraLabels.forEach(label => label.classList.remove('is-connected'));
      this.clearRadialLines();
    }

    showOuterRing() {
      this.root.dataset.phase = 'outer';
      this.root.dataset.color = 'gold';

      // Update info panel
      this.infoLabel.textContent = 'OPERATIONS';
      this.infoText.textContent = 'Security, Evaluation, Ops, and Orchestration protect the system';
      this.infoPanel.classList.add('is-visible');
      this.infoPanel.dataset.color = 'gold';

      // Reveal both rings fully (remove dim)
      this.innerRing.classList.add('is-visible');
      this.innerRing.classList.remove('is-dim');
      this.outerRing.classList.add('is-visible');
      this.outerRing.classList.remove('is-dim');
      this.quote.classList.add('is-visible');
      this.centerLabel.style.opacity = '0';
      this.centerLabel.style.visibility = 'hidden';
      this.root.classList.remove('is-ambient');

      // Clear infrastructure highlights and radial lines
      this.infraLabels.forEach(label => label.classList.remove('is-connected'));
      this.clearRadialLines();
    }

    enterAmbientMode() {
      this.root.dataset.phase = 'ambient';
      this.root.classList.add('is-ambient');

      this.centerLabel.style.opacity = '1';
      this.centerLabel.style.visibility = 'visible';

      this.infoPanel.classList.remove('is-visible');
      this.innerRing.classList.add('is-visible', 'is-ambient');
      this.outerRing.classList.add('is-visible', 'is-ambient');
      this.quote.classList.add('is-visible');

      // Clear infrastructure highlights and radial lines
      this.infraLabels.forEach(label => label.classList.remove('is-connected'));
      this.clearRadialLines();

      this.nodes.forEach(node => {
        node.classList.remove('is-active', 'is-complete');
        node.classList.add('is-ambient');
      });
      this.paths.forEach(path => {
        path.classList.remove('is-active', 'is-complete');
        path.classList.add('is-ambient');
      });
    }

    clearAll() {
      this.root.removeAttribute('data-phase');
      this.root.removeAttribute('data-step');
      this.root.removeAttribute('data-color');
      this.root.classList.remove('is-ambient');

      this.progressFill.style.strokeDashoffset = 264;
      this.scrollHint.style.opacity = '1';
      this.infoPanel.classList.remove('is-visible');
      this.innerRing.classList.remove('is-visible', 'is-ambient', 'is-dim');
      this.outerRing.classList.remove('is-visible', 'is-ambient', 'is-dim');
      this.quote.classList.remove('is-visible');

      // Clear infrastructure highlights
      this.infraLabels.forEach(label => label.classList.remove('is-connected'));
      this.centerLabel.style.opacity = '0';
      this.centerLabel.style.visibility = 'hidden';

      this.nodes.forEach(node => {
        node.classList.remove('is-active', 'is-complete', 'is-ambient');
      });
      this.paths.forEach(path => {
        path.classList.remove('is-active', 'is-complete', 'is-ambient');
      });

      // Clear radial lines
      this.radialLines.innerHTML = '';
    }

    drawRadialLines(stepId, color) {
      // Clear previous lines
      this.radialLines.innerHTML = '';

      const relatedInfra = STEP_CONNECTIONS[stepId] || [];
      if (relatedInfra.length === 0) return;

      // Get stage rect for coordinate conversion
      const stageRect = this.stage.getBoundingClientRect();

      // Get active node position
      const activeNode = this.container.querySelector(`.sd__node[data-node="${stepId}"]`);
      if (!activeNode) return;
      const nodeRect = activeNode.getBoundingClientRect();
      const nodeX = ((nodeRect.left + nodeRect.width / 2) - stageRect.left) / stageRect.width * 500;
      const nodeY = ((nodeRect.top + nodeRect.height / 2) - stageRect.top) / stageRect.height * 500;

      // Draw lines to each related infrastructure label
      relatedInfra.forEach(infraId => {
        const label = this.container.querySelector(`.sd__ring-label[data-infra="${infraId}"]`);
        if (!label) return;

        const labelRect = label.getBoundingClientRect();
        const labelX = ((labelRect.left + labelRect.width / 2) - stageRect.left) / stageRect.width * 500;
        const labelY = ((labelRect.top + labelRect.height / 2) - stageRect.top) / stageRect.height * 500;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', nodeX);
        line.setAttribute('y1', nodeY);
        line.setAttribute('x2', labelX);
        line.setAttribute('y2', labelY);
        line.setAttribute('class', `sd__radial-line sd__radial-line--${color}`);
        this.radialLines.appendChild(line);
      });
    }

    clearRadialLines() {
      this.radialLines.innerHTML = '';
    }

    updatePhaseIndicator() {
      this.phaseDots.forEach(dot => {
        const dotPhase = dot.dataset.phase;
        const isActive =
          (dotPhase === 'core' && this.phase === 'core') ||
          (dotPhase === 'inner' && (this.phase === 'inner' || this.phase === 'outer' || this.phase === 'ambient')) ||
          (dotPhase === 'outer' && (this.phase === 'outer' || this.phase === 'ambient'));
        dot.classList.toggle('is-active', isActive);
      });
    }

    animateParticles() {
      const width = this.canvas.width / window.devicePixelRatio;
      const height = this.canvas.height / window.devicePixelRatio;

      this.ctx.clearRect(0, 0, width, height);

      // Diamond points for 4-node layout
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.min(width, height) * 0.38;

      const points = [
        { x: cx, y: cy - r },      // top (ASK)
        { x: cx + r, y: cy },      // right (CHECK)
        { x: cx, y: cy + r },      // bottom (RUN)
        { x: cx - r, y: cy }       // left (SEE)
      ];

      const step = CORE_STEPS[this.currentStep] || { color: 'gold' };
      const color = this.phase === 'ambient' ? '#ffd700' :
                    step.color === 'cyan' ? '#00d4ff' :
                    step.color === 'coral' ? '#ff6b4a' : '#ffd700';

      const rgb = this.hexToRgb(color);

      this.particles.forEach(particle => {
        particle.progress += particle.speed;
        if (particle.progress > 1) particle.progress = 0;

        const totalProgress = particle.progress * 4;
        const segmentIndex = Math.floor(totalProgress) % 4;
        const segmentProgress = totalProgress - segmentIndex;

        const from = points[segmentIndex];
        const to = points[(segmentIndex + 1) % 4];

        const x = from.x + (to.x - from.x) * segmentProgress;
        const y = from.y + (to.y - from.y) * segmentProgress;

        this.ctx.beginPath();
        this.ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${particle.opacity * (this.phase === 'ambient' ? 0.4 : 0.6)})`;
        this.ctx.fill();
      });

      this.animationFrame = requestAnimationFrame(() => this.animateParticles());
    }

    hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 215, b: 0 };
    }
  }

  // Initialize
  function init() {
    const container = document.querySelector('.system-overview__diagram');
    if (container) {
      new SystemDiagram(container);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
