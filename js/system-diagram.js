/**
 * System Architecture Diagram - Clean Flow Style
 * With tooltips, infrastructure mapping, visual loop, and interactive connections
 */

(function() {
  'use strict';

  // Infrastructure items with their descriptions
  const INFRA_DETAILS = {
    'Prompt': {
      desc: 'System instructions, user messages, and conversation history',
      flow: 'in'
    },
    'Tools': {
      desc: 'Tool schemas for LLM, implementations for execution',
      flow: 'both'
    },
    'State': {
      desc: 'Event log, filesystem persistence, and context management',
      flow: 'both'
    },
    'Verification': {
      desc: 'Input validation and action approval gates (Layer 0-2)',
      flow: 'in'
    },
    'Security': {
      desc: 'Permission checks, sandboxing, and defense-in-depth',
      flow: 'in'
    },
    'Evaluation': {
      desc: 'Result assessment, quality metrics, feeds back to improve',
      flow: 'both'
    },
    'Operations': {
      desc: 'Retries, rate limits, circuit breakers, resilience patterns',
      flow: 'out'
    },
    'Orchestration': {
      desc: 'Loop lifecycle, termination conditions, task decomposition',
      flow: 'both'
    }
  };

  const STEPS = [
    {
      id: 'invoke',
      code: 'llm.invoke()',
      desc: 'LLM decides',
      type: 'stochastic',
      tooltip: {
        title: 'Generate Action',
        text: 'The stochastic moment. LLM receives context and decides what to do next.',
        receives: 'context (from observe)',
        returns: 'proposed action',
        infra: ['Prompt', 'Tools', 'State', 'Orchestration']
      }
    },
    {
      id: 'validate',
      code: 'isValid()',
      desc: 'Check safety',
      type: 'deterministic',
      tooltip: {
        title: 'Validate Action',
        text: 'Safety layers check the action. Layer 0 → 1 → 2. Lower overrides higher.',
        receives: 'proposed action',
        returns: 'allow → execute, deny → error to LLM',
        infra: ['Verification', 'Security', 'Orchestration']
      }
    },
    {
      id: 'execute',
      code: 'execute()',
      desc: 'Run tool',
      type: 'deterministic',
      tooltip: {
        title: 'Execute Tool',
        text: 'Your code runs the tool. Deterministic dispatch, though tool results may vary.',
        receives: 'approved action',
        returns: 'tool result (success or error)',
        infra: ['Tools', 'Operations', 'Orchestration']
      }
    },
    {
      id: 'observe',
      code: 'observe()',
      desc: 'Record result',
      type: 'deterministic',
      tooltip: {
        title: 'Observe Result',
        text: 'Append result to context. This feeds back to llm.invoke() for the next iteration.',
        receives: 'tool result',
        returns: 'updated context → back to invoke',
        infra: ['State', 'Evaluation', 'Orchestration']
      }
    }
  ];

  const INFRA = {
    context: [
      { label: 'Prompt', section: 'prompt', num: '02', usedBy: ['invoke'] },
      { label: 'Tools', section: 'tools', num: '03', usedBy: ['invoke', 'execute'] },
      { label: 'State', section: 'state', num: '05', usedBy: ['invoke', 'observe'] }
    ],
    operations: [
      { label: 'Verification', section: 'verification', num: '04', usedBy: ['validate'] },
      { label: 'Security', section: 'security', num: '06', usedBy: ['validate'] },
      { label: 'Evaluation', section: 'evaluation', num: '07', usedBy: ['observe'] },
      { label: 'Operations', section: 'ops', num: '08', usedBy: ['execute'] },
      { label: 'Orchestration', section: 'orchestration', num: '09', usedBy: ['invoke', 'validate', 'execute', 'observe'] }
    ]
  };

  function render(container) {
    container.innerHTML = `
      <div class="arch">
        <!-- The Loop -->
        <div class="arch__loop">
          <div class="arch__loop-header">
            <span class="arch__loop-keyword">while (true)</span>
            <span class="arch__loop-title">// the agent loop</span>
          </div>

          <div class="arch__flow">
            <!-- Loop-back arrow -->
            <div class="arch__loop-back">
              <svg viewBox="0 0 600 30" preserveAspectRatio="none">
                <defs>
                  <marker id="loopArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" class="arch__loop-back-arrow"/>
                  </marker>
                </defs>
                <path class="arch__loop-back-path"
                      d="M 540 25 C 540 5, 520 5, 480 5 L 120 5 C 80 5, 60 5, 60 25"
                      marker-end="url(#loopArrow)"/>
              </svg>
              <span class="arch__loop-back-label">context</span>
            </div>

            ${STEPS.map((step, i) => `
              <a href="#${step.id === 'invoke' ? 'loop' : step.id === 'validate' ? 'verification' : step.id === 'execute' ? 'tools' : 'state'}"
                 class="arch__step"
                 data-type="${step.type}"
                 tabindex="0">
                <div class="arch__tooltip">
                  <div class="arch__tooltip-title">${step.tooltip.title}</div>
                  <div class="arch__tooltip-text">${step.tooltip.text}</div>
                  <div class="arch__tooltip-io">
                    <div><span>receives:</span> <span class="in">${step.tooltip.receives}</span></div>
                    <div><span>returns:</span> <span class="out">${step.tooltip.returns}</span></div>
                  </div>
                  <div class="arch__tooltip-infra">
                    <span>uses:</span> ${step.tooltip.infra.join(', ')}
                  </div>
                </div>
                <span class="arch__step-num">${i + 1}</span>
                <div class="arch__step-box">
                  <span class="arch__step-code">${step.code}</span>
                </div>
                <span class="arch__step-desc">${step.desc}</span>
                <span class="arch__step-type">${step.type}</span>
              </a>
            `).join('')}
          </div>
        </div>

        <!-- Infrastructure -->
        <div class="arch__infra">
          <div class="arch__infra-group" data-group="context">
            <div class="arch__infra-header">
              <div class="arch__infra-title">Context</div>
              <div class="arch__infra-subtitle">feeds into the loop</div>
            </div>
            <div class="arch__infra-list">
              ${INFRA.context.map(item => `
                <a href="#${item.section}"
                   class="arch__infra-item"
                   data-infra="${item.label.toLowerCase()}"
                   data-used-by="${item.usedBy.join(',')}"
                   data-flow="${INFRA_DETAILS[item.label]?.flow || 'both'}">
                  <div class="arch__infra-item-main">
                    <span class="arch__infra-icon arch__infra-icon--${INFRA_DETAILS[item.label]?.flow || 'both'}"></span>
                    <span class="arch__infra-label">${item.label}</span>
                    <span class="arch__infra-num">${item.num}</span>
                  </div>
                  <div class="arch__infra-desc">${INFRA_DETAILS[item.label]?.desc || ''}</div>
                  <div class="arch__infra-flow">
                    ${item.usedBy.length ? `<span class="arch__infra-used">→ ${item.usedBy.map(s => STEPS.find(st => st.id === s)?.code).join(', ')}</span>` : ''}
                  </div>
                </a>
              `).join('')}
            </div>
          </div>
          <div class="arch__infra-group" data-group="operations">
            <div class="arch__infra-header">
              <div class="arch__infra-title">Operations</div>
              <div class="arch__infra-subtitle">processes loop actions</div>
            </div>
            <div class="arch__infra-list">
              ${INFRA.operations.map(item => `
                <a href="#${item.section}"
                   class="arch__infra-item"
                   data-infra="${item.label.toLowerCase()}"
                   data-used-by="${item.usedBy.join(',')}"
                   data-flow="${INFRA_DETAILS[item.label]?.flow || 'both'}">
                  <div class="arch__infra-item-main">
                    <span class="arch__infra-icon arch__infra-icon--${INFRA_DETAILS[item.label]?.flow || 'both'}"></span>
                    <span class="arch__infra-label">${item.label}</span>
                    <span class="arch__infra-num">${item.num}</span>
                  </div>
                  <div class="arch__infra-desc">${INFRA_DETAILS[item.label]?.desc || ''}</div>
                  <div class="arch__infra-flow">
                    ${item.usedBy.length ? `<span class="arch__infra-used">→ ${item.usedBy.map(s => STEPS.find(st => st.id === s)?.code).join(', ')}</span>` : ''}
                  </div>
                </a>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="arch__footer">
          <div class="arch__quote">"The loop is the architecture."</div>
          <div class="arch__quote-sub">Everything else is infrastructure.</div>
        </div>
      </div>
    `;

    // Smooth scroll
    container.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', e => {
        const target = document.getElementById(link.getAttribute('href').slice(1));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Bidirectional highlighting: step ↔ infrastructure
    const arch = container.querySelector('.arch');
    const steps = container.querySelectorAll('.arch__step');
    const infraItems = container.querySelectorAll('.arch__infra-item');

    // Step hover → highlight related infrastructure
    steps.forEach(step => {
      const stepId = step.querySelector('a')?.getAttribute('href')?.slice(1) ||
                     step.getAttribute('href')?.replace('#', '') ||
                     STEPS.find(s => step.querySelector('.arch__step-code')?.textContent.includes(s.code))?.id;

      // Find the step's infra from STEPS data
      const stepData = STEPS.find(s => s.id === stepId || step.querySelector('.arch__step-code')?.textContent === s.code);
      const infraNames = stepData?.tooltip?.infra || [];

      step.addEventListener('mouseenter', () => {
        arch.classList.add('arch--step-hover');
        step.classList.add('arch__step--active');

        // Highlight matching infrastructure items
        infraItems.forEach(item => {
          const infraLabel = item.querySelector('.arch__infra-label')?.textContent;
          if (infraNames.includes(infraLabel)) {
            item.classList.add('arch__infra-item--active');
          } else {
            item.classList.add('arch__infra-item--dimmed');
          }
        });
      });

      step.addEventListener('mouseleave', () => {
        arch.classList.remove('arch--step-hover');
        step.classList.remove('arch__step--active');
        infraItems.forEach(item => {
          item.classList.remove('arch__infra-item--active', 'arch__infra-item--dimmed');
        });
      });
    });

    // Infrastructure hover → highlight related steps
    infraItems.forEach(item => {
      const usedByAttr = item.getAttribute('data-used-by');
      const usedBySteps = usedByAttr ? usedByAttr.split(',').filter(Boolean) : [];

      item.addEventListener('mouseenter', () => {
        arch.classList.add('arch--infra-hover');
        item.classList.add('arch__infra-item--active');

        // Highlight matching steps
        steps.forEach(step => {
          const stepCode = step.querySelector('.arch__step-code')?.textContent;
          const stepData = STEPS.find(s => s.code === stepCode);
          if (stepData && usedBySteps.includes(stepData.id)) {
            step.classList.add('arch__step--active');
          } else {
            step.classList.add('arch__step--dimmed');
          }
        });

        // Dim other infrastructure items
        infraItems.forEach(other => {
          if (other !== item) {
            other.classList.add('arch__infra-item--dimmed');
          }
        });
      });

      item.addEventListener('mouseleave', () => {
        arch.classList.remove('arch--infra-hover');
        item.classList.remove('arch__infra-item--active');
        steps.forEach(step => {
          step.classList.remove('arch__step--active', 'arch__step--dimmed');
        });
        infraItems.forEach(other => {
          other.classList.remove('arch__infra-item--dimmed');
        });
      });
    });
  }

  function init() {
    const container = document.querySelector('.system-overview__diagram');
    if (container) render(container);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
