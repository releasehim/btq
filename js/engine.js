/**
 * engine.js
 * Motor lógico independiente de la interfaz gráfica para Árboles B, B+ y B*.
 * 
 * Implementa las estructuras y operaciones como Generadores (generators) de ES6,
 * permitiendo pausar en cada paso crítico del algoritmo para realizar preguntas de opción múltiple.
 */

// Contador global para IDs de nodos (permite tracking visual consistente)
let nodeIdCounter = 0;
function generateNodeId() {
    return 'node_' + (++nodeIdCounter);
}

/**
 * Clase base para un nodo de Árbol B estándar.
 */
class BTreeNode {
    constructor(isLeaf = true) {
        this.id = generateNodeId();
        this.keys = [];        // Claves ordenadas numéricamente
        this.children = [];    // Nodos hijos (BTreeNode)
        this.isLeaf = isLeaf;
    }

    /**
     * Clona el nodo de manera recursiva manteniendo los mismos IDs.
     * Esto permite duplicar el estado del árbol para análisis lógicos o rollback
     * sin perder la identidad visual de los nodos en la animación.
     */
    clone() {
        const copy = new BTreeNode(this.isLeaf);
        copy.id = this.id;
        copy.keys = [...this.keys];
        copy.children = this.children.map(child => child.clone());
        return copy;
    }
}

/**
 * Motor de Operaciones de Árbol B estándar.
 */
class BTreeEngine {
    constructor(M = 4) {
        this.M = M; // Orden del árbol (número máximo de hijos)
        
        // Mínimos y máximos según la convención de la cátedra FOD (UNLP) / HEA:
        // Max claves = M - 1
        // Min claves = Math.floor(M / 2) - 1  (para nodos no raíz)
        this.maxKeys = M - 1;
        this.minKeys = Math.floor(M / 2) - 1; 
    }

    /**
     * Generador para buscar una clave en el árbol B.
     * Registra las lecturas de disco lógicas (I/O).
     * 
     * @param {BTreeNode} root - Nodo raíz del árbol
     * @param {number} key - Clave a buscar
     * @yields {object} Evento de paso lógico
     * @returns {object} { found: boolean, path: BTreeNode[], index: number }
     */
    *searchGenerator(root, key) {
        let current = root;
        const path = [];
        let reads = 0;

        if (!current || current.keys.length === 0) {
            yield {
                type: 'SEARCH_EMPTY',
                message: 'El árbol está vacío. Fin de la búsqueda.',
                reads: 0
            };
            return { found: false, path: [], index: -1, reads: 0 };
        }

        while (current) {
            path.push(current);
            reads++; // Cada nodo visitado/inspeccionado es una lectura lógica de disco (I/O)

            yield {
                type: 'SEARCH_NODE',
                nodeId: current.id,
                keys: [...current.keys],
                searchKey: key,
                isLeaf: current.isLeaf,
                message: `Buscando ${key} en el nodo ${current.id} (Claves: [${current.keys.join(', ')}]).`,
                reads: reads
            };

            // Buscar posición de la clave o del puntero hijo
            let i = 0;
            while (i < current.keys.length && key > current.keys[i]) {
                i++;
            }

            // ¿Se encontró la clave exactamente en este nodo?
            if (i < current.keys.length && key === current.keys[i]) {
                yield {
                    type: 'SEARCH_FOUND',
                    nodeId: current.id,
                    keys: [...current.keys],
                    foundKey: key,
                    foundIndex: i,
                    message: `¡Clave ${key} encontrada en el nodo ${current.id}, posición ${i}!`,
                    reads: reads
                };
                return { found: true, path, index: i, reads };
            }

            if (current.isLeaf) {
                // Llegamos a una hoja y no encontramos la clave
                yield {
                    type: 'SEARCH_NOT_FOUND',
                    nodeId: current.id,
                    searchKey: key,
                    message: `Clave ${key} no encontrada. Se detiene la búsqueda en el nodo hoja ${current.id}.`,
                    reads: reads
                };
                return { found: false, path, index: i, reads };
            }

            // Descender al hijo indicado por la posición
            const nextChild = current.children[i];
            yield {
                type: 'SEARCH_DESCEND',
                nodeId: current.id,
                childIndex: i,
                nextChildId: nextChild.id,
                message: `Clave ${key} se encuentra entre los límites. Descendiendo al hijo en índice ${i} (Nodo ${nextChild.id}).`,
                reads: reads
            };
            current = nextChild;
        }

        return { found: false, path: [], index: -1, reads };
    }

    /**
     * Generador para insertar una clave en el árbol B.
     * Pausa en cada paso crítico para que el flujo UI pueda solicitar respuestas al usuario.
     * 
     * @param {BTreeNode} root - Nodo raíz original (no modificado directamente)
     * @param {number} key - Clave a insertar
     * @yields {object} Evento de paso lógico con estados intermedios y contadores I/O
     */
    *insertGenerator(root, key) {
        // Clonamos la raíz y el árbol para no corromper el estado global si se cancela o falla
        let treeRoot = root ? root.clone() : new BTreeNode(true);
        let writes = 0;

        // 1. Ejecutar la búsqueda de la hoja correspondiente
        const searchResult = yield* this.searchGenerator(treeRoot, key);
        let reads = searchResult.reads;

        if (searchResult.found) {
            yield {
                type: 'INSERT_DUPLICATE',
                key: key,
                message: `Error: La clave ${key} ya existe en el árbol B. No se permiten duplicados.`,
                reads,
                writes
            };
            return { root: treeRoot, reads, writes, success: false };
        }

        const path = searchResult.path;
        let leaf = path[path.length - 1];

        if (!leaf) {
            // Caso de árbol inicialmente vacío
            leaf = new BTreeNode(true);
            treeRoot = leaf;
            path.push(leaf);
        }

        const insertIndex = searchResult.index;

        // 2. Pausar antes de insertar físicamente en la hoja (Pregunta potencial sobre dónde insertar)
        yield {
            type: 'BEFORE_LEAF_INSERT',
            nodeId: leaf.id,
            nodeKeys: [...leaf.keys],
            key: key,
            insertIndex: insertIndex,
            message: `Listo para insertar ${key} en el nodo hoja ${leaf.id} (posición esperada: ${insertIndex}).`,
            reads,
            writes
        };

        // Insertar en la hoja y ordenar
        leaf.keys.splice(insertIndex, 0, key);
        writes++; // Modificación del nodo hoja -> 1 Escritura física en disco

        yield {
            type: 'AFTER_LEAF_INSERT',
            nodeId: leaf.id,
            nodeKeys: [...leaf.keys],
            key: key,
            message: `Clave ${key} insertada en la hoja ${leaf.id}. Nuevas claves: [${leaf.keys.join(', ')}].`,
            reads,
            writes
        };

        let node = leaf;

        // 3. Propagación de Overflows hacia arriba
        while (node.keys.length > this.maxKeys) {
            yield {
                type: 'OVERFLOW_DETECTED',
                nodeId: node.id,
                nodeKeys: [...node.keys],
                maxKeys: this.maxKeys,
                message: `¡Overflow detectado en el nodo ${node.id}! Contiene ${node.keys.length} claves (máximo permitido: ${this.maxKeys}).`,
                reads,
                writes
            };

            // Decidir la posición de promoción.
            // Convención HEA/UNLP: Math.floor(length / 2)
            const promoIndex = Math.floor(node.keys.length / 2);
            const promoKey = node.keys[promoIndex];

            yield {
                type: 'CHOOSE_PROMOTION',
                nodeId: node.id,
                nodeKeys: [...node.keys],
                promoIndex: promoIndex,
                promoKey: promoKey,
                message: `Determinando clave a promocionar. En el nodo ${node.id}, con claves [${node.keys.join(', ')}], subirá la clave en el índice ${promoIndex} (Valor: ${promoKey}).`,
                reads,
                writes
            };

            // Partición del nodo en Izquierda y Derecha
            const leftKeys = node.keys.slice(0, promoIndex);
            const rightKeys = node.keys.slice(promoIndex + 1);

            let leftChildren = [];
            let rightChildren = [];
            if (!node.isLeaf) {
                leftChildren = node.children.slice(0, promoIndex + 1);
                rightChildren = node.children.slice(promoIndex + 1);
            }

            // Crear el nuevo nodo hermano derecho
            const rightNode = new BTreeNode(node.isLeaf);
            rightNode.keys = rightKeys;
            rightNode.children = rightChildren;

            // Reutilizar el nodo original para la izquierda
            node.keys = leftKeys;
            node.children = leftChildren;

            // Al dividir el nodo, escribimos 2 nodos: el izquierdo (modificado) y el derecho (nuevo)
            writes += 2; 

            yield {
                type: 'SPLIT_NODE',
                leftNodeId: node.id,
                leftKeys: [...node.keys],
                rightNodeId: rightNode.id,
                rightKeys: [...rightNode.keys],
                promoKey: promoKey,
                message: `Nodo partido. Izquierda (${node.id}): [${node.keys.join(', ')}]. Derecha (${rightNode.id}): [${rightNode.keys.join(', ')}]. Promocionando clave ${promoKey}.`,
                reads,
                writes
            };

            // Si el nodo dividido era la raíz del árbol
            if (path.length <= 1) {
                const newRoot = new BTreeNode(false);
                newRoot.keys = [promoKey];
                newRoot.children = [node, rightNode];
                
                treeRoot = newRoot;
                writes++; // Escritura de la nueva raíz creada

                yield {
                    type: 'NEW_ROOT',
                    rootId: treeRoot.id,
                    rootKeys: [...treeRoot.keys],
                    leftId: node.id,
                    rightId: rightNode.id,
                    message: `Se crea una nueva raíz (Nodo ${treeRoot.id}) con la clave promocionada ${promoKey}. La altura del árbol aumenta en 1.`,
                    reads,
                    writes
                };
                break; // Fin del proceso, el overflow llegó al tope
            } else {
                // Extraer el padre del camino de búsqueda
                path.pop(); // Sacar el nodo actual de la pila
                const parent = path[path.length - 1];

                // Buscar la posición donde se insertará la clave promocionada en el padre
                let insertPos = 0;
                while (insertPos < parent.keys.length && promoKey > parent.keys[insertPos]) {
                    insertPos++;
                }

                yield {
                    type: 'PROPAGATE_PARENT',
                    parentId: parent.id,
                    parentKeys: [...parent.keys],
                    promoKey: promoKey,
                    insertPos: insertPos,
                    message: `Promocionando ${promoKey} al nodo padre ${parent.id} en la posición de inserción ${insertPos}.`,
                    reads,
                    writes
                };

                // Insertar clave promocionada y ajustar hijos
                parent.keys.splice(insertPos, 0, promoKey);
                parent.children.splice(insertPos + 1, 0, rightNode);
                writes++; // Modificación del nodo padre -> 1 Escritura en disco

                node = parent; // El nodo a chequear en la siguiente iteración es el padre
            }
        }

        yield {
            type: 'INSERT_COMPLETED',
            rootId: treeRoot.id,
            message: `Operación de inserción de ${key} completada con éxito.`,
            reads,
            writes
        };

        return { root: treeRoot, reads, writes, success: true };
    }
}

/**
 * Marcadores lógicos y clases para árboles B+ y B* (Esqueleto lúdico para futuras etapas).
 */
class BPlusTreeNode extends BTreeNode {
    constructor(isLeaf = true) {
        super(isLeaf);
        this.next = null; // Puntero secuencial al siguiente nodo hoja
        this.prev = null; // Puntero secuencial al nodo hoja previo
    }
}

class BStarTreeNode extends BTreeNode {
    constructor(isLeaf = true) {
        super(isLeaf);
    }
}
