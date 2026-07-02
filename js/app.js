/**
 * app.js
 * Coordinador principal del flujo del simulador educativo de Árboles B.
 * 
 * Gestiona el bucle de la máquina de pasos, la interactividad del cuestionario,
 * las estadísticas de desempeño del alumno (score, costo E/S) y la carga de configuraciones.
 */

class BTreeApp {
    constructor() {
        this.root = null;
        this.engine = null; // Se inicializa abajo en updateEngine()
        this.visualizer = new TreeVisualizer();
        
        this.activeGenerator = null;
        this.currentStep = null;
        this.currentMode = 'cuestionario'; // Modo inicial
        this.autoStepTimeout = null;       // Temporizador para modo automático
        
        // Métricas de E/S acumuladas (Óptimas y de Estudiante con penalidades)
        this.accumulatedIO = { reads: 0, writes: 0 }; // Óptimo acumulado
        this.studentIO = { reads: 0, writes: 0 };     // Alumno acumulado
        this.currentOperationPenalties = { reads: 0, writes: 0 }; // Penalidades de la operación activa
        
        // Puntuación del alumno en el cuestionario
        this.score = { correct: 0, total: 0 };
        
        // Secuencia aleatoria de operaciones pendientes
        this.operationQueue = [];
        
        // Elementos DOM
        this.svgElement = document.getElementById('tree-svg');
        this.btnInsertar = document.getElementById('btn-insertar');
        this.btnBuscar = document.getElementById('btn-buscar');
        this.btnEliminar = document.getElementById('btn-eliminar');
        this.btnReset = document.getElementById('btn-reset');
        this.btnGenerarSecuencia = document.getElementById('btn-generar-secuencia');
        this.btnSiguiente = document.getElementById('btn-siguiente');
        
        this.valInsertar = document.getElementById('num-insertar');
        this.valBuscar = document.getElementById('num-buscar');
        this.valEliminar = document.getElementById('num-eliminar');
        this.selectTipo = document.getElementById('select-tipo');
        this.selectModo = document.getElementById('select-modo');
        this.selectOrden = document.getElementById('select-orden');
        this.selectPolitica = document.getElementById('select-politica');
        
        this.questionCard = document.getElementById('question-card');
        this.questionContent = document.getElementById('question-content');
        this.logContent = document.getElementById('log-content');
        
        this.lblReads = document.getElementById('lbl-reads');
        this.lblWrites = document.getElementById('lbl-writes');
        this.lblReadsOpt = document.getElementById('lbl-reads-opt');
        this.lblWritesOpt = document.getElementById('lbl-writes-opt');
        this.lblScore = document.getElementById('lbl-score');
        this.lblQueue = document.getElementById('lbl-queue');
        
        // Elemento reset en cabecera
        this.btnResetHeader = document.getElementById('btn-reset-header');
        
        document.body.className = `mode-${this.currentMode}`; // Inicializar clase
        
        this.updateEngine();
        this.initEvents();
        this.renderState();
    }

    /**
     * Inicialización de event listeners en controles HTML.
     */
    initEvents() {
        // Al presionar Enter en inputs
        this.valInsertar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.triggerInsert();
        });
        this.valBuscar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.triggerSearch();
        });
        this.valEliminar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.triggerDelete();
        });

        // Botones de acción principal
        this.btnInsertar.addEventListener('click', () => this.triggerInsert());
        this.btnBuscar.addEventListener('click', () => this.triggerSearch());
        this.btnEliminar.addEventListener('click', () => this.triggerDelete());
        this.btnReset.addEventListener('click', () => this.resetTree());
        this.btnGenerarSecuencia.addEventListener('click', () => this.generateRandomSequence());
        
        // Botón de paso a paso
        this.btnSiguiente.addEventListener('click', () => this.advanceStep());
        
        // Configuración de Tipo de Árbol
        this.selectTipo.addEventListener('change', () => {
            const confirmChange = confirm('Cambiar el tipo de árbol destruirá el árbol actual. ¿Realmente desea continuar?');
            if (confirmChange) {
                this.updateEngine();
                this.resetTree();
            } else {
                this.selectTipo.value = this.getTreeTypeString();
            }
        });

        // Configuración de Modo de Simulación
        this.selectModo.addEventListener('change', () => {
            if (this.autoStepTimeout) {
                clearTimeout(this.autoStepTimeout);
                this.autoStepTimeout = null;
            }
            
            this.currentMode = this.selectModo.value;
            document.body.className = `mode-${this.currentMode}`;
            this.renderState();

            if (this.activeGenerator) {
                if (this.currentMode === 'automatico') {
                    this.advanceStep();
                } else {
                    this.renderCurrentStepVisuals();
                }
            } else {
                this.setUIBlockMode(false);
            }
        });

        if (this.btnResetHeader) {
            this.btnResetHeader.addEventListener('click', () => this.resetTree());
        }

        // Configuración de Orden
        this.selectOrden.addEventListener('change', () => {
            const confirmChange = confirm('Cambiar el orden M destruirá el árbol actual. ¿Realmente desea continuar?');
            if (confirmChange) {
                this.updateEngine();
                this.resetTree();
            } else {
                this.selectOrden.value = this.engine.M; // Revertir
            }
        });
    }

    /**
     * Inicia una operación de inserción.
     */
    triggerInsert() {
        if (this.activeGenerator) return; // Bloquear si hay animación activa

        const val = parseInt(this.valInsertar.value);
        if (isNaN(val)) {
            alert('Por favor ingrese un número entero válido.');
            return;
        }

        this.valInsertar.value = ''; // Limpiar campo
        this.currentOperationPenalties = { reads: 0, writes: 0 };
        this.activeGenerator = this.engine.insertGenerator(this.root, val);
        this.setUIBlockMode(true);
        this.advanceStep();
    }

    /**
     * Inicia una operación de búsqueda interactiva.
     */
    triggerSearch() {
        if (this.activeGenerator) return;

        const val = parseInt(this.valBuscar.value);
        if (isNaN(val)) {
            alert('Por favor ingrese un número entero válido.');
            return;
        }

        this.valBuscar.value = '';
        this.currentOperationPenalties = { reads: 0, writes: 0 };
        this.activeGenerator = this.engine.searchGenerator(this.root, val);
        this.setUIBlockMode(true);
        this.advanceStep();
    }

    /**
     * Inicia una operación de eliminación interactiva.
     */
    triggerDelete() {
        if (this.activeGenerator) return;

        const val = parseInt(this.valEliminar.value);
        if (isNaN(val)) {
            alert('Por favor ingrese un número entero válido.');
            return;
        }

        this.valEliminar.value = '';
        this.currentOperationPenalties = { reads: 0, writes: 0 };
        const policy = this.selectPolitica.value;
        this.activeGenerator = this.engine.deleteGenerator(this.root, val, policy);
        this.setUIBlockMode(true);
        this.advanceStep();
    }

    /**
     * Instancia el motor correspondiente al tipo de árbol y orden seleccionados.
     */
    updateEngine() {
        const M = parseInt(this.selectOrden.value);
        const tipo = this.selectTipo.value;
        if (tipo === 'arbolB') {
            this.engine = new BTreeEngine(M);
        } else if (tipo === 'arbolBMas') {
            this.engine = new BPlusTreeEngine(M);
        } else if (tipo === 'arbolBEstrella') {
            this.engine = new BStarTreeEngine(M);
        }
    }

    /**
     * Helper para obtener la representación string del motor actual.
     */
    getTreeTypeString() {
        if (this.engine instanceof BTreeEngine) return 'arbolB';
        if (this.engine instanceof BPlusTreeEngine) return 'arbolBMas';
        if (this.engine instanceof BStarTreeEngine) return 'arbolBEstrella';
        return 'arbolB';
    }

    /**
     * Resetea el simulador al estado inicial.
     */
    resetTree() {
        if (this.autoStepTimeout) {
            clearTimeout(this.autoStepTimeout);
            this.autoStepTimeout = null;
        }
        this.updateEngine();
        this.root = null;
        this.activeGenerator = null;
        this.currentStep = null;
        this.accumulatedIO = { reads: 0, writes: 0 };
        this.studentIO = { reads: 0, writes: 0 };
        this.currentOperationPenalties = { reads: 0, writes: 0 };
        this.score = { correct: 0, total: 0 };
        this.operationQueue = [];
        this.setUIBlockMode(false);
        this.logContent.innerHTML = '';
        this.renderState();
    }

    /**
     * Genera una lista de 5 a 8 operaciones aleatorias mezclando altas y bajas.
     */
    generateRandomSequence() {
        if (this.activeGenerator) return;
        
        const length = 5 + Math.floor(Math.random() * 4); // entre 5 y 8
        const sequence = [];
        
        // Recolectar claves actuales en el árbol para poder borrarlas
        const currentKeys = [];
        const collect = (node) => {
            if (!node) return;
            currentKeys.push(...node.keys);
            node.children.forEach(collect);
        };
        collect(this.root);

        const tempKeys = [...currentKeys];

        for (let i = 0; i < length; i++) {
            // Si hay claves y el azar lo determina, elegimos borrar una clave existente
            if (tempKeys.length > 2 && Math.random() > 0.4) {
                const idx = Math.floor(Math.random() * tempKeys.length);
                const val = tempKeys.splice(idx, 1)[0];
                sequence.push({ type: 'baja', value: val });
            } else {
                // Generar una inserción aleatoria
                let val;
                do {
                    val = 1 + Math.floor(Math.random() * 98);
                } while (sequence.some(op => op.value === val) || tempKeys.includes(val) || currentKeys.includes(val));
                tempKeys.push(val);
                sequence.push({ type: 'alta', value: val });
            }
        }
        
        this.operationQueue = sequence;
        this.renderState();
        this.appendLog(`Secuencia aleatoria: [${sequence.map(o => `${o.type === 'alta' ? '+' : '-'}${o.value}`).join(', ')}]`);
    }

    /**
     * Procesa la siguiente operación de la secuencia si la cola tiene elementos.
     */
    processNextInQueue() {
        if (this.operationQueue.length === 0 || this.activeGenerator) return;
        
        const nextOp = this.operationQueue.shift();
        this.renderState();
        
        if (nextOp.type === 'alta') {
            this.activeGenerator = this.engine.insertGenerator(this.root, nextOp.value);
            this.setUIBlockMode(true);
            this.advanceStep();
        } else if (nextOp.type === 'baja') {
            const policy = this.selectPolitica.value;
            this.activeGenerator = this.engine.deleteGenerator(this.root, nextOp.value, policy);
            this.setUIBlockMode(true);
            this.advanceStep();
        }
    }

    /**
     * Avanza el iterador de pasos (generator loop).
     */
    advanceStep() {
        if (!this.activeGenerator) return;

        if (this.autoStepTimeout) {
            clearTimeout(this.autoStepTimeout);
            this.autoStepTimeout = null;
        }

        // Limpiar estado de la tarjeta de preguntas
        this.questionCard.className = 'glass-card question-card';
        this.questionContent.innerHTML = '';
        this.btnSiguiente.disabled = true;

        const result = this.activeGenerator.next();

        if (result.done) {
            // El algoritmo ha finalizado exitosamente.
            const operationSummary = result.value;
            if (operationSummary.success) {
                this.root = operationSummary.root;
                this.accumulatedIO.reads += operationSummary.reads;
                this.accumulatedIO.writes += operationSummary.writes;
                this.studentIO.reads += operationSummary.reads + this.currentOperationPenalties.reads;
                this.studentIO.writes += operationSummary.writes + this.currentOperationPenalties.writes;
            }

            this.activeGenerator = null;
            this.currentStep = null;
            this.setUIBlockMode(false);
            
            // Mostrar pantalla de finalización de operación con tabla comparativa de costo
            const opReads = operationSummary.reads;
            const opWrites = operationSummary.writes;
            const studReads = opReads + this.currentOperationPenalties.reads;
            const studWrites = opWrites + this.currentOperationPenalties.writes;
            const totalPenalties = this.currentOperationPenalties.reads + this.currentOperationPenalties.writes;

            let summaryMessage = '';
            if (totalPenalties === 0) {
                summaryMessage = `
                    <span class="badge badge-emerald">¡Costo Óptimo Logrado!</span>
                    <h3 style="margin-top: 0.5rem; margin-bottom: 0.5rem;">¡Excelente desempeño!</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">
                        Ejecutaste la operación con el mínimo absoluto de accesos físicos a disco.
                    </p>
                `;
            } else {
                summaryMessage = `
                    <span class="badge badge-indigo">Operación Terminada</span>
                    <h3 style="margin-top: 0.5rem; margin-bottom: 0.5rem; color: var(--accent-rose);">Costo con Penalizaciones</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">
                        Por tus ${totalPenalties} errores en el cuestionario, incurriste en lecturas o escrituras innecesarias en disco.
                    </p>
                `;
            }

            this.questionContent.innerHTML = `
                <div class="prompt-placeholder">
                    ${summaryMessage}
                    
                    <div style="margin-top: 1rem; border-top: 1px solid var(--border-glass); padding-top: 0.75rem; text-align: left; width: 100%;">
                        <h4 style="font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.5rem; font-weight: 600;">Accesos a disco (esta operación):</h4>
                        <table style="width: 100%; font-size: 0.8rem; color: var(--text-secondary); border-collapse: collapse;">
                            <thead>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); text-align: left;">
                                    <th style="padding: 0.35rem 0; font-weight: 500; color: var(--text-muted);">Métrica</th>
                                    <th style="padding: 0.35rem 0; font-weight: 500; color: var(--text-muted);">Tuyo</th>
                                    <th style="padding: 0.35rem 0; font-weight: 500; color: var(--text-muted);">Óptimo</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                                    <td style="padding: 0.4rem 0; color: var(--accent-cyan);">Lecturas (Reads)</td>
                                    <td style="padding: 0.4rem 0;"><strong>${studReads}</strong></td>
                                    <td style="padding: 0.4rem 0;">${opReads}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 0.4rem 0; color: var(--accent-rose);">Escrituras (Writes)</td>
                                    <td style="padding: 0.4rem 0;"><strong>${studWrites}</strong></td>
                                    <td style="padding: 0.4rem 0;">${opWrites}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            this.appendLog(operationSummary.message);
            this.renderState();

            // Auto-procesar el siguiente elemento de la cola aleatoria con retraso
            if (this.operationQueue.length > 0) {
                setTimeout(() => this.processNextInQueue(), 2500);
            }
            return;
        }

        // Si la ejecución no ha terminado, representamos el paso
        this.currentStep = result.value;
        this.appendLog(this.currentStep.message);

        // 1. Redibujar con los resaltados correspondientes
        const highlightOptions = {};
        if (this.currentStep.nodeId) {
            highlightOptions.activeNodeId = this.currentStep.nodeId;
        } else if (this.currentStep.leftNodeId) {
            highlightOptions.activeNodeId = this.currentStep.leftNodeId;
        }

        if (this.currentStep.searchKey && this.currentStep.keys) {
            // Buscar si hay coincidencia para pintar
            highlightOptions.highlightedKeys = [this.currentStep.searchKey];
        }
        if (this.currentStep.promoKey) {
            highlightOptions.promoKey = this.currentStep.promoKey;
        }

        this.visualizer.draw(this.svgElement, this.currentStep.leftKeys ? this.reconstructTreeForStep() : this.root || this.reconstructTreeForStep(), highlightOptions);
        this.renderState(); // Actualizar indicadores E/S parciales

        // 2. Dibujar interfaz según modo
        this.renderCurrentStepVisuals();

        // 3. Si es automático, programar siguiente paso
        if (this.currentMode === 'automatico') {
            this.autoStepTimeout = setTimeout(() => {
                this.advanceStep();
            }, 1200);
        }
    }

    /**
     * Dibuja el estado del cuestionario / paso informativo basado en el modo actual.
     */
    renderCurrentStepVisuals() {
        if (!this.currentStep) return;

        this.questionCard.className = 'glass-card question-card';
        this.questionContent.innerHTML = '';

        if (this.currentMode === 'cuestionario') {
            const question = QuestionGenerator.generateQuestion(this.currentStep);
            if (question) {
                this.renderQuestion(question);
            } else {
                this.renderInformativeStep();
            }
        } else {
            this.renderInformativeStep();
        }
    }

    /**
     * Dibuja y gestiona la interactividad de la pregunta.
     */
    renderQuestion(q) {
        this.questionCard.classList.add('active-question');
        
        let html = `
            <div class="question-header">
                <span class="badge badge-indigo">Cuestionario</span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">Paso Crítico</span>
            </div>
            <div class="question-text">${q.questionText}</div>
            <div class="options-list">
        `;

        q.options.forEach((opt, idx) => {
            html += `
                <div class="option-item" data-index="${idx}">${opt}</div>
            `;
        });

        html += `</div>`;
        this.questionContent.innerHTML = html;

        // Añadir listeners para la selección
        const optionsDivs = this.questionContent.querySelectorAll('.option-item');
        optionsDivs.forEach(div => {
            div.addEventListener('click', (e) => {
                const selectedIdx = parseInt(e.currentTarget.getAttribute('data-index'));
                this.evaluateAnswer(selectedIdx, q, optionsDivs);
            });
        });
    }

    /**
     * Evalúa la respuesta elegida por el alumno, coloreando y mostrando el feedback.
     */
    evaluateAnswer(selectedIdx, q, optionsDivs) {
        // Prevenir re-clicks una vez contestado
        optionsDivs.forEach(div => {
            div.style.pointerEvents = 'none';
        });

        const isCorrect = selectedIdx === q.correctIndex;
        
        // Incrementar score
        this.score.total++;
        if (isCorrect) {
            this.score.correct++;
            this.questionCard.classList.add('correct-answer');
        } else {
            this.questionCard.classList.add('incorrect-answer');
            
            // Aplicar penalidad de E/S lógica al cometer error conceptual
            if (q.questionText.includes('índice') || q.questionText.includes('puntero') || q.questionText.includes('descender')) {
                this.currentOperationPenalties.reads++; // Penalidad de lectura extra
            } else {
                this.currentOperationPenalties.writes++; // Penalidad de escritura extra
            }
        }

        // Colorear opciones
        optionsDivs.forEach((div, idx) => {
            if (idx === q.correctIndex) {
                div.classList.add('selected-correct');
            } else if (idx === selectedIdx) {
                div.classList.add('selected-incorrect');
            }
        });

        // Generar panel de feedback inmediato
        const feedbackContainer = document.createElement('div');
        feedbackContainer.className = 'feedback-container';
        feedbackContainer.innerHTML = `
            <div class="feedback-title ${isCorrect ? 'correct' : 'incorrect'}">
                ${isCorrect ? '✔ ¡Respuesta Correcta!' : '✘ Respuesta Incorrecta'}
            </div>
            <div class="feedback-text">${q.feedback[selectedIdx]}</div>
        `;
        this.questionContent.appendChild(feedbackContainer);

        // Habilitar avance al siguiente paso
        this.btnSiguiente.disabled = false;
        this.renderState();
    }

    /**
     * Paso informativo que no requiere evaluar conocimiento (auto-avanzable).
     */
    renderInformativeStep() {
        let modeLabel = '';
        let modeClass = 'badge-indigo';
        let helperText = '';
        
        if (this.currentMode === 'automatico') {
            modeLabel = 'Automático';
            modeClass = 'badge-emerald';
            helperText = 'Modo automático activo. Avanzando solo...';
        } else if (this.currentMode === 'interactivo') {
            modeLabel = 'Interactivo';
            modeClass = 'badge-indigo';
            helperText = 'Revisá la animación arriba y hacé clic en "Siguiente Paso" para continuar.';
        } else {
            modeLabel = 'Visualizando';
            modeClass = 'badge-indigo';
            helperText = 'Revisá la animación arriba y hacé clic en "Siguiente Paso" para continuar.';
        }

        this.questionContent.innerHTML = `
            <div class="prompt-placeholder">
                <span class="badge ${modeClass}">${modeLabel}</span>
                <p style="margin-top: 0.8rem; line-height: 1.4; color: var(--text-secondary);">
                    ${this.currentStep.message}
                </p>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">
                    ${helperText}
                </p>
            </div>
        `;

        if (this.currentMode === 'automatico') {
            this.btnSiguiente.disabled = true;
        } else {
            this.btnSiguiente.disabled = false;
        }
    }

    /**
     * Reconstruye temporalmente el árbol en un paso intermedio (como un split antes de que sea permanente)
     * para que el visualizador pueda dibujar el estado visual actual.
     */
    reconstructTreeForStep() {
        // Si no hay nodo raíz, devolvemos un nodo vacío
        if (!this.root) return new BTreeNode(true);
        
        // Para visualización limpia, dibujamos el árbol clonado de trabajo que mantiene el motor lúdico.
        // Dado que la inserción clona la raíz, el visualizador dibuja esa estructura modificada en vivo.
        return this.root; 
    }

    /**
     * Agrega registros formateados al visor de consola inferior.
     */
    appendLog(text) {
        if (!text) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        // Destacar palabras clave
        let formatted = text
            .replace(/(Overflow|Overflow detectado)/g, '<span class="highlight" style="color: var(--accent-rose)">$1</span>')
            .replace(/(clave \d+|clave)/gi, '<span class="highlight">$1</span>')
            .replace(/(particion|partido|split)/gi, '<span class="highlight" style="color: var(--accent-indigo)">$1</span>');

        entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${formatted}`;
        this.logContent.appendChild(entry);
        
        // Scroll automático
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }

    /**
     * Dibuja los contadores de la UI.
     */
    renderState() {
        // Calcular lecturas y escrituras acumuladas del estudiante
        const curPenalReads = this.currentStep ? this.currentOperationPenalties.reads : 0;
        const curPenalWrites = this.currentStep ? this.currentOperationPenalties.writes : 0;
        
        const totalStudReads = this.studentIO.reads + (this.currentStep ? (this.currentStep.reads || 0) : 0) + curPenalReads;
        const totalStudWrites = this.studentIO.writes + (this.currentStep ? (this.currentStep.writes || 0) : 0) + curPenalWrites;

        const totalOptReads = this.accumulatedIO.reads + (this.currentStep ? (this.currentStep.reads || 0) : 0);
        const totalOptWrites = this.accumulatedIO.writes + (this.currentStep ? (this.currentStep.writes || 0) : 0);

        this.lblReads.textContent = totalStudReads;
        this.lblWrites.textContent = totalStudWrites;

        this.lblReadsOpt.textContent = `Tuyo (Óptimo: ${totalOptReads})`;
        this.lblWritesOpt.textContent = `Tuyo (Óptimo: ${totalOptWrites})`;
        
        if (this.score.total > 0) {
            const percent = Math.round((this.score.correct / this.score.total) * 100);
            this.lblScore.textContent = `${this.score.correct}/${this.score.total} (${percent}%)`;
        } else {
            this.lblScore.textContent = '0/0 (0%)';
        }

        // Cola de operaciones
        if (this.operationQueue.length > 0) {
            this.lblQueue.textContent = `Pendientes: ${this.operationQueue.length} (${this.operationQueue.map(o => `${o.type === 'alta' ? '+' : '-'}${o.value}`).join(', ')})`;
        } else {
            this.lblQueue.textContent = 'Ninguna';
        }

        // Renderizar el tipo de árbol en el encabezado de visualización
        const lblTreeType = document.querySelector('.tree-title');
        if (lblTreeType) {
            const typeName = this.selectTipo.options[this.selectTipo.selectedIndex].text;
            lblTreeType.textContent = `Estructura Activa: ${typeName} (Orden ${this.engine.M})`;
        }

        // Renderizar el árbol real actual
        if (!this.activeGenerator) {
            this.visualizer.draw(this.svgElement, this.root);
        }
    }

    /**
     * Bloquea/desbloquea inputs y botones de control generales mientras hay una animación en curso.
     */
    setUIBlockMode(blocked) {
        this.valInsertar.disabled = blocked;
        this.valBuscar.disabled = blocked;
        this.valEliminar.disabled = blocked;
        this.btnInsertar.disabled = blocked;
        this.btnBuscar.disabled = blocked;
        this.btnEliminar.disabled = blocked;
        this.btnReset.disabled = blocked;
        this.btnGenerarSecuencia.disabled = blocked;
        this.selectOrden.disabled = blocked;

        if (this.btnResetHeader) {
            this.btnResetHeader.disabled = blocked;
        }

        if (blocked) {
            this.btnSiguiente.style.display = 'flex';
        } else {
            this.btnSiguiente.style.display = 'none';
            
            if (this.currentMode === 'cuestionario') {
                this.questionContent.innerHTML = `
                    <div class="prompt-placeholder" style="padding: 2rem 1rem;">
                        <h3 style="color: var(--text-primary); margin-bottom: 0.75rem; font-size: 1.1rem; font-weight: 600;">¿Listo para poner a prueba tus conocimientos?</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.5;">
                            El sistema generará una secuencia de operaciones aleatorias de altas y bajas, y te preguntará el comportamiento del árbol en cada balanceo.
                        </p>
                        <button class="btn btn-primary" id="btn-start-quiz" style="margin: 0 auto; display: block; padding: 0.6rem 1.5rem; font-size: 0.9rem;">Iniciar Cuestionario</button>
                    </div>
                `;
                const btnStart = document.getElementById('btn-start-quiz');
                if (btnStart) {
                    btnStart.addEventListener('click', () => this.generateRandomSequence());
                }
            } else if (this.currentMode === 'automatico') {
                this.questionContent.innerHTML = `
                    <div class="prompt-placeholder" style="padding: 2rem 1rem;">
                        <h3 style="color: var(--text-primary); margin-bottom: 0.75rem; font-size: 1.1rem; font-weight: 600;">Simulación Automática</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.5;">
                            Observá cómo se construyen y reestructuran los árboles B, B+ y B* de forma automatizada (1.2s por paso).
                        </p>
                        <button class="btn btn-emerald" id="btn-start-auto" style="margin: 0 auto; display: block; padding: 0.6rem 1.5rem; font-size: 0.9rem; background: var(--accent-emerald); color: white;">Iniciar Reproducción</button>
                    </div>
                `;
                const btnStart = document.getElementById('btn-start-auto');
                if (btnStart) {
                    btnStart.addEventListener('click', () => this.generateRandomSequence());
                }
            } else {
                this.questionContent.innerHTML = `
                    <div class="prompt-placeholder">
                        Ingresá un elemento a insertar, buscar o eliminar a la derecha, o generá una secuencia aleatoria para iniciar la simulación interactiva.
                    </div>
                `;
            }
        }
    }
}

// Instanciar la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BTreeApp();
});
