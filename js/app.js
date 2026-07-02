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
        this.engine = new BTreeEngine(4); // Valor inicial orden M=4
        this.visualizer = new TreeVisualizer();
        
        this.activeGenerator = null;
        this.currentStep = null;
        
        // Métricas de E/S acumuladas y óptimas
        this.accumulatedIO = { reads: 0, writes: 0 };
        this.optimalIO = { reads: 0, writes: 0 };
        
        // Puntuación del alumno en el cuestionario
        this.score = { correct: 0, total: 0 };
        
        // Secuencia aleatoria de operaciones pendientes
        this.operationQueue = [];
        
        // Elementos DOM
        this.svgElement = document.getElementById('tree-svg');
        this.btnInsertar = document.getElementById('btn-insertar');
        this.btnBuscar = document.getElementById('btn-buscar');
        this.btnReset = document.getElementById('btn-reset');
        this.btnGenerarSecuencia = document.getElementById('btn-generar-secuencia');
        this.btnSiguiente = document.getElementById('btn-siguiente');
        
        this.valInsertar = document.getElementById('num-insertar');
        this.valBuscar = document.getElementById('num-buscar');
        this.selectOrden = document.getElementById('select-orden');
        this.selectPolitica = document.getElementById('select-politica');
        
        this.questionCard = document.getElementById('question-card');
        this.questionContent = document.getElementById('question-content');
        this.logContent = document.getElementById('log-content');
        
        this.lblReads = document.getElementById('lbl-reads');
        this.lblWrites = document.getElementById('lbl-writes');
        this.lblScore = document.getElementById('lbl-score');
        this.lblQueue = document.getElementById('lbl-queue');
        
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

        // Botones de acción principal
        this.btnInsertar.addEventListener('click', () => this.triggerInsert());
        this.btnBuscar.addEventListener('click', () => this.triggerSearch());
        this.btnReset.addEventListener('click', () => this.resetTree());
        this.btnGenerarSecuencia.addEventListener('click', () => this.generateRandomSequence());
        
        // Botón de paso a paso
        this.btnSiguiente.addEventListener('click', () => this.advanceStep());
        
        // Configuración de Orden
        this.selectOrden.addEventListener('change', () => {
            const confirmChange = confirm('Cambiar el orden M destruirá el árbol actual. ¿Realmente desea continuar?');
            if (confirmChange) {
                const M = parseInt(this.selectOrden.value);
                this.engine = new BTreeEngine(M);
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
        this.activeGenerator = this.engine.searchGenerator(this.root, val);
        this.setUIBlockMode(true);
        this.advanceStep();
    }

    /**
     * Resetea el simulador al estado inicial.
     */
    resetTree() {
        this.root = null;
        this.activeGenerator = null;
        this.currentStep = null;
        this.accumulatedIO = { reads: 0, writes: 0 };
        this.score = { correct: 0, total: 0 };
        this.operationQueue = [];
        this.setUIBlockMode(false);
        this.logContent.innerHTML = '';
        this.renderState();
    }

    /**
     * Genera una lista de 5 a 8 números aleatorios para insertar correlativamente.
     */
    generateRandomSequence() {
        if (this.activeGenerator) return;
        
        const length = 5 + Math.floor(Math.random() * 4); // entre 5 y 8
        const sequence = [];
        while (sequence.length < length) {
            const val = 1 + Math.floor(Math.random() * 98); // valores entre 1 y 99
            if (!sequence.includes(val)) {
                sequence.push(val);
            }
        }
        
        this.operationQueue = sequence.map(v => ({ type: 'alta', value: v }));
        this.renderState();
        this.appendLog(`Generada secuencia de operaciones: [${sequence.map(o => `+${o}`).join(', ')}]`);
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
        }
    }

    /**
     * Avanza el iterador de pasos (generator loop).
     */
    advanceStep() {
        if (!this.activeGenerator) return;

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
            }

            this.activeGenerator = null;
            this.currentStep = null;
            this.setUIBlockMode(false);
            
            // Mostrar pantalla de finalización de operación
            this.questionContent.innerHTML = `
                <div class="prompt-placeholder">
                    <span class="badge badge-emerald">Operación Terminada</span>
                    <h3 style="margin-top: 0.5rem; margin-bottom: 0.5rem;">Costo de la Operación actual:</h3>
                    <p style="font-size: 0.9rem; color: var(--text-secondary);">
                        Lecturas a Disco (Reads): <strong style="color: var(--accent-cyan);">${operationSummary.reads}</strong><br>
                        Escrituras a Disco (Writes): <strong style="color: var(--accent-rose);">${operationSummary.writes}</strong>
                    </p>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.75rem;">
                        El árbol se ha actualizado al nuevo estado permanente.
                    </p>
                </div>
            `;

            this.appendLog(operationSummary.message);
            this.renderState();

            // Auto-procesar el siguiente elemento de la cola aleatoria con retraso
            if (this.operationQueue.length > 0) {
                setTimeout(() => this.processNextInQueue(), 1500);
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

        // 2. Generar pregunta didáctica
        const question = QuestionGenerator.generateQuestion(this.currentStep);

        if (question) {
            this.renderQuestion(question);
        } else {
            // Pasos puramente visuales/informativos (e.g. SEARCH_NODE, NEW_ROOT)
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
        this.questionContent.innerHTML = `
            <div class="prompt-placeholder">
                <span class="badge badge-indigo">Visualizando</span>
                <p style="margin-top: 0.8rem; line-height: 1.4; color: var(--text-secondary);">
                    ${this.currentStep.message}
                </p>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">
                    Revisá la animación del árbol arriba y hacé clic en "Siguiente" para avanzar.
                </p>
            </div>
        `;
        this.btnSiguiente.disabled = false;
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
        this.lblReads.textContent = this.accumulatedIO.reads + (this.currentStep ? this.currentStep.reads || 0 : 0);
        this.lblWrites.textContent = this.accumulatedIO.writes + (this.currentStep ? this.currentStep.writes || 0 : 0);
        
        if (this.score.total > 0) {
            const percent = Math.round((this.score.correct / this.score.total) * 100);
            this.lblScore.textContent = `${this.score.correct}/${this.score.total} (${percent}%)`;
        } else {
            this.lblScore.textContent = '0/0 (0%)';
        }

        // Cola de operaciones
        if (this.operationQueue.length > 0) {
            this.lblQueue.textContent = `Pendientes: ${this.operationQueue.length} (${this.operationQueue.map(o => `+${o.value}`).join(', ')})`;
        } else {
            this.lblQueue.textContent = 'Ninguna';
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
        this.btnInsertar.disabled = blocked;
        this.btnBuscar.disabled = blocked;
        this.btnReset.disabled = blocked;
        this.btnGenerarSecuencia.disabled = blocked;
        this.selectOrden.disabled = blocked;

        if (blocked) {
            this.btnSiguiente.style.display = 'flex';
        } else {
            this.btnSiguiente.style.display = 'none';
            this.questionContent.innerHTML = `
                <div class="prompt-placeholder">
                    Ingresá un elemento a insertar o buscar arriba, o generá una secuencia aleatoria para iniciar el cuestionario.
                </div>
            `;
        }
    }
}

// Instanciar la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BTreeApp();
});
