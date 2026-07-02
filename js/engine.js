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

    /**
     * Generador para eliminar una clave en el árbol B.
     * Soporta las políticas de underflow configuradas por el usuario.
     * 
     * @param {BTreeNode} root - Nodo raíz original
     * @param {number} key - Clave a eliminar
     * @param {string} policy - Política de bajo flujo: 'izquierda', 'derecha', 'izquierdaODer', 'derOIzq', 'izquierdaYDerecha'
     * @yields {object} Evento de paso lógico
     */
    *deleteGenerator(root, key, policy = 'izquierdaODer') {
        let treeRoot = root ? root.clone() : null;
        let writes = 0;

        if (!treeRoot) {
            yield {
                type: 'DELETE_EMPTY',
                message: 'El árbol está vacío. No se puede eliminar.',
                reads: 0,
                writes: 0
            };
            return { root: null, reads: 0, writes: 0, success: false };
        }

        // 1. Buscar la clave a eliminar y guardar el camino
        const searchResult = yield* this.searchGenerator(treeRoot, key);
        let reads = searchResult.reads;

        if (!searchResult.found) {
            yield {
                type: 'DELETE_NOT_FOUND',
                key: key,
                message: `Error: La clave ${key} no existe en el árbol B.`,
                reads,
                writes
            };
            return { root: treeRoot, reads, writes, success: false };
        }

        const path = searchResult.path;
        let node = path[path.length - 1];
        let deleteIdx = searchResult.index;

        // 2. Si la clave no está en una hoja, intercambiar con su sucesor
        if (!node.isLeaf) {
            // El sucesor es el elemento más pequeño de la rama derecha
            let succNode = node.children[deleteIdx + 1];
            path.push(succNode);
            reads++; // Leemos el primer hijo de la rama derecha
            
            yield {
                type: 'SEARCH_SUCCESSOR_START',
                nodeId: succNode.id,
                message: `La clave ${key} está en un nodo interno. Buscando su sucesor (mínimo de la rama derecha). Descendiendo al nodo ${succNode.id}.`,
                reads,
                writes
            };

            while (!succNode.isLeaf) {
                succNode = succNode.children[0];
                path.push(succNode);
                reads++; // Leemos los hijos izquierdos sucesivos
                yield {
                    type: 'SEARCH_SUCCESSOR_DESCEND',
                    nodeId: succNode.id,
                    message: `Descendiendo al hijo izquierdo (Nodo ${succNode.id}) para buscar el sucesor.`,
                    reads,
                    writes
                };
            }

            const successorKey = succNode.keys[0];
            yield {
                type: 'BEFORE_SWAP_SUCCESSOR',
                nodeId: node.id,
                key: key,
                successorNodeId: succNode.id,
                successorKey: successorKey,
                message: `Sucesor encontrado: ${successorKey} en el nodo hoja ${succNode.id}. Intercambiando la clave ${key} con su sucesor ${successorKey}.`,
                reads,
                writes
            };

            // Intercambiar las claves en los nodos
            node.keys[deleteIdx] = successorKey;
            succNode.keys[0] = key;
            writes += 2; // Escribimos el nodo interno modificado y el nodo hoja modificado

            yield {
                type: 'AFTER_SWAP_SUCCESSOR',
                nodeId: node.id,
                successorNodeId: succNode.id,
                message: `Intercambio realizado. Ahora procederemos a eliminar ${key} del nodo hoja ${succNode.id}.`,
                reads,
                writes
            };

            // Ahora la clave a borrar está en la hoja 'succNode' en el índice 0
            node = succNode;
            deleteIdx = 0;
        }

        // 3. Eliminar la clave del nodo hoja
        yield {
            type: 'BEFORE_LEAF_DELETE',
            nodeId: node.id,
            nodeKeys: [...node.keys],
            keyToDelete: key,
            deleteIdx: deleteIdx,
            message: `Eliminando clave ${key} en la hoja ${node.id} (posición ${deleteIdx}).`,
            reads,
            writes
        };

        node.keys.splice(deleteIdx, 1);
        writes++; // Escribimos la hoja modificada

        yield {
            type: 'AFTER_LEAF_DELETE',
            nodeId: node.id,
            nodeKeys: [...node.keys],
            message: `Clave eliminada. Nuevas claves del nodo hoja: [${node.keys.join(', ')}].`,
            reads,
            writes
        };

        // 4. Controlar underflow propagándose hacia arriba
        // Nota: en el caso de la raíz, se permite que tenga menos de minKeys (mínimo 1 clave).
        while (node.keys.length < this.minKeys) {
            if (node === treeRoot) {
                // Caso especial de la raíz
                if (treeRoot.keys.length === 0 && treeRoot.children.length > 0) {
                    // La raíz quedó vacía pero tiene un hijo. El hijo pasa a ser la nueva raíz.
                    treeRoot = treeRoot.children[0];
                    writes++; // Actualizamos la raíz
                    yield {
                        type: 'DECREASE_HEIGHT',
                        newRootId: treeRoot.id,
                        message: `La raíz quedó vacía. El único hijo (Nodo ${treeRoot.id}) se convierte en la nueva raíz. La altura del árbol disminuye en 1.`,
                        reads,
                        writes
                    };
                }
                break; // El underflow en la raíz no puede corregirse más arriba
            }

            yield {
                type: 'UNDERFLOW_DETECTED',
                nodeId: node.id,
                nodeKeys: [...node.keys],
                minKeys: this.minKeys,
                message: `¡Underflow detectado en el nodo ${node.id}! Contiene ${node.keys.length} claves (mínimo requerido: ${this.minKeys}).`,
                reads,
                writes
            };

            // Encontrar el padre y los hermanos adyacentes
            path.pop(); // Remover el nodo actual del path para encontrar al padre
            const parent = path[path.length - 1];
            const nodeIdx = parent.children.indexOf(node);

            let leftSibling = nodeIdx > 0 ? parent.children[nodeIdx - 1] : null;
            let rightSibling = nodeIdx < parent.children.length - 1 ? parent.children[nodeIdx + 1] : null;

            // Determinar qué hacer según la política de underflow
            let resolved = false;

            // Funciones auxiliares para verificar si un hermano puede prestar
            const canBorrow = (sibling) => sibling && sibling.keys.length - 1 >= this.minKeys;

            // Rutas de resolución basadas en prioridades de la política
            const tryLeftRedistribution = () => {
                if (canBorrow(leftSibling)) {
                    // Redistribuir desde el hermano izquierdo
                    const parentKeyIdx = nodeIdx - 1;
                    const parentKey = parent.keys[parentKeyIdx];
                    const siblingKey = leftSibling.keys.pop();
                    
                    // Insertar la clave del padre en el nodo con underflow
                    node.keys.unshift(parentKey);
                    // Mover la clave del hermano al padre
                    parent.keys[parentKeyIdx] = siblingKey;

                    // Si no son hojas, mover el hijo del hermano al nodo
                    if (!node.isLeaf) {
                        const siblingChild = leftSibling.children.pop();
                        node.children.unshift(siblingChild);
                    }

                    writes += 3; // Modificamos: hermano, nodo, padre
                    return { success: true, type: 'REDISTRIBUTE_LEFT', msg: `Redistribución desde hermano izquierdo: La clave del padre ${parentKey} baja al nodo ${node.id}, y la clave ${siblingKey} del hermano ${leftSibling.id} sube al padre.` };
                }
                return { success: false };
            };

            const tryRightRedistribution = () => {
                if (canBorrow(rightSibling)) {
                    // Redistribuir desde el hermano derecho
                    const parentKeyIdx = nodeIdx;
                    const parentKey = parent.keys[parentKeyIdx];
                    const siblingKey = rightSibling.keys.shift();

                    // Insertar la clave del padre en el nodo con underflow
                    node.keys.push(parentKey);
                    // Mover la clave del hermano al padre
                    parent.keys[parentKeyIdx] = siblingKey;

                    // Si no son hojas, mover el hijo del hermano al nodo
                    if (!node.isLeaf) {
                        const siblingChild = rightSibling.children.shift();
                        node.children.push(siblingChild);
                    }

                    writes += 3; // Modificamos: hermano, nodo, padre
                    return { success: true, type: 'REDISTRIBUTE_RIGHT', msg: `Redistribución desde hermano derecho: La clave del padre ${parentKey} baja al nodo ${node.id}, y la clave ${siblingKey} del hermano ${rightSibling.id} sube al padre.` };
                }
                return { success: false };
            };

            const mergeWithLeft = () => {
                // Fusionar nodo con hermano izquierdo
                const parentKeyIdx = nodeIdx - 1;
                const parentKey = parent.keys[parentKeyIdx];

                // Fusionamos claves: [claves izquierdo] + [clave padre] + [claves nodo]
                leftSibling.keys.push(parentKey, ...node.keys);
                
                // Fusionamos hijos si no son hojas
                if (!node.isLeaf) {
                    leftSibling.children.push(...node.children);
                }

                // Quitar clave del padre y remover el nodo de sus hijos
                parent.keys.splice(parentKeyIdx, 1);
                parent.children.splice(nodeIdx, 1);

                writes += 2; // Modificamos: hermano (que absorbe), padre (que pierde clave e hijo)
                return { type: 'MERGE_LEFT', msg: `Fusión con hermano izquierdo: El nodo ${node.id} y la clave del padre ${parentKey} se fusionan en el hermano izquierdo ${leftSibling.id}. El nodo ${node.id} se elimina.` };
            };

            const mergeWithRight = () => {
                // Fusionar nodo con hermano derecho
                const parentKeyIdx = nodeIdx;
                const parentKey = parent.keys[parentKeyIdx];

                // Fusionamos claves: [claves nodo] + [clave padre] + [claves derecho]
                node.keys.push(parentKey, ...rightSibling.keys);

                // Fusionamos hijos si no son hojas
                if (!node.isLeaf) {
                    node.children.push(...rightSibling.children);
                }

                // Quitar clave del padre y remover el hermano derecho de sus hijos
                parent.keys.splice(parentKeyIdx, 1);
                parent.children.splice(nodeIdx + 1, 1);

                writes += 2; // Modificamos: nodo (que absorbe), padre (que pierde clave e hijo)
                return { type: 'MERGE_RIGHT', msg: `Fusión con hermano derecho: El nodo ${node.id} y la clave del padre ${parentKey} se fusionan con el hermano derecho ${rightSibling.id}.` };
            };

            // Ejecución según la política
            let action = null;

            if (policy === 'izquierda') {
                action = tryLeftRedistribution();
                if (action.success) {
                    resolved = true;
                } else {
                    // Si no se puede redistribuir, fusionar
                    if (leftSibling) {
                        action = mergeWithLeft();
                    } else {
                        // Forzado a usar derecho por falta de izquierdo
                        action = canBorrow(rightSibling) ? tryRightRedistribution() : mergeWithRight();
                    }
                }
            } else if (policy === 'derecha') {
                action = tryRightRedistribution();
                if (action.success) {
                    resolved = true;
                } else {
                    if (rightSibling) {
                        action = mergeWithRight();
                    } else {
                        // Forzado a usar izquierdo por falta de derecho
                        action = canBorrow(leftSibling) ? tryLeftRedistribution() : mergeWithLeft();
                    }
                }
            } else if (policy === 'izquierdaODer' || policy === 'izquierdaYDerecha') {
                // La política Y en árboles B estándar se comporta similar a Izq-o-Der para underflows
                action = tryLeftRedistribution();
                if (action.success) {
                    resolved = true;
                } else {
                    action = tryRightRedistribution();
                    if (action.success) {
                        resolved = true;
                    } else {
                        // Fusionar con el que exista (preferencia izquierdo)
                        if (leftSibling) {
                            action = mergeWithLeft();
                        } else {
                            action = mergeWithRight();
                        }
                    }
                }
            } else if (policy === 'derOIzq') {
                action = tryRightRedistribution();
                if (action.success) {
                    resolved = true;
                } else {
                    action = tryLeftRedistribution();
                    if (action.success) {
                        resolved = true;
                    } else {
                        // Fusionar con el que exista (preferencia derecho)
                        if (rightSibling) {
                            action = mergeWithRight();
                        } else {
                            action = mergeWithLeft();
                        }
                    }
                }
            }

            yield {
                type: action.type,
                nodeId: node.id,
                parentId: parent.id,
                siblingId: leftSibling ? leftSibling.id : (rightSibling ? rightSibling.id : null),
                message: action.msg,
                reads,
                writes
            };

            if (resolved) {
                break; // El underflow se ha resuelto con redistribución
            } else {
                // En caso de fusión, el underflow se propaga al padre
                node = parent;
            }
        }

        yield {
            type: 'DELETE_COMPLETED',
            rootId: treeRoot.id,
            message: `Operación de eliminación de ${key} completada con éxito.`,
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

    clone() {
        const copy = new BPlusTreeNode(this.isLeaf);
        copy.id = this.id;
        copy.keys = [...this.keys];
        // En un clonado simple, mantenemos las referencias de enlaces hojas temporales
        copy.next = this.next;
        copy.prev = this.prev;
        copy.children = this.children.map(child => child.clone());
        return copy;
    }
}

class BPlusTreeEngine {
    constructor(M = 4) {
        this.M = M;
        this.maxKeys = M - 1;
        this.minKeys = Math.floor(M / 2) - 1;
    }

    /**
     * Búsqueda en B+ Tree: Siempre desciende hasta las hojas, incluso si la clave coincide antes.
     */
    *searchGenerator(root, key) {
        let current = root;
        const path = [];
        let reads = 0;

        if (!current || current.keys.length === 0) {
            yield {
                type: 'SEARCH_EMPTY',
                message: 'El árbol B+ está vacío.',
                reads: 0
            };
            return { found: false, path: [], index: -1, reads: 0 };
        }

        while (current) {
            path.push(current);
            reads++;

            yield {
                type: 'SEARCH_NODE',
                nodeId: current.id,
                keys: [...current.keys],
                searchKey: key,
                isLeaf: current.isLeaf,
                message: `Buscando ${key} en el nodo ${current.id} del Árbol B+.`,
                reads
            };

            let i = 0;
            while (i < current.keys.length && key >= current.keys[i]) {
                i++;
            }

            if (current.isLeaf) {
                // En el B+, las claves reales están SOLO en las hojas.
                // Buscamos coincidencia exacta en la hoja.
                const exactIdx = current.keys.indexOf(key);
                if (exactIdx !== -1) {
                    yield {
                        type: 'SEARCH_FOUND',
                        nodeId: current.id,
                        keys: [...current.keys],
                        foundKey: key,
                        foundIndex: exactIdx,
                        message: `¡Clave ${key} encontrada en el nodo hoja ${current.id}, posición ${exactIdx}!`,
                        reads
                    };
                    return { found: true, path, index: exactIdx, reads };
                } else {
                    yield {
                        type: 'SEARCH_NOT_FOUND',
                        nodeId: current.id,
                        searchKey: key,
                        message: `Clave ${key} no encontrada en las hojas del Árbol B+.`,
                        reads
                    };
                    return { found: false, path, index: i, reads };
                }
            }

            // Descender en nodo interno
            // Si key == keys[i], por convención descendemos por la derecha (puntero i)
            const nextChild = current.children[i];
            yield {
                type: 'SEARCH_DESCEND',
                nodeId: current.id,
                childIndex: i,
                nextChildId: nextChild.id,
                message: `Descendiendo por puntero ${i} (Nodo ${nextChild.id}) en Árbol B+.`,
                reads
            };
            current = nextChild;
        }

        return { found: false, path: [], index: -1, reads };
    }

    /**
     * Inserción en Árbol B+:
     * - Las hojas contienen todas las claves.
     * - Al dividir una hoja, la clave promocionada SE COPIA (se duplica) y permanece en la hoja derecha.
     * - Al dividir un nodo interno, la clave promocionada SE MUEVE (no se duplica).
     */
    *insertGenerator(root, key) {
        let treeRoot = root ? root.clone() : new BPlusTreeNode(true);
        let writes = 0;

        const searchResult = yield* this.searchGenerator(treeRoot, key);
        let reads = searchResult.reads;

        if (searchResult.found) {
            yield {
                type: 'INSERT_DUPLICATE',
                key: key,
                message: `Error: La clave ${key} ya existe en el árbol B+.`,
                reads,
                writes
            };
            return { root: treeRoot, reads, writes, success: false };
        }

        const path = searchResult.path;
        let leaf = path[path.length - 1];

        if (!leaf) {
            leaf = new BPlusTreeNode(true);
            treeRoot = leaf;
            path.push(leaf);
        }

        // Encontrar índice exacto para insertar
        let insertIndex = 0;
        while (insertIndex < leaf.keys.length && key > leaf.keys[insertIndex]) {
            insertIndex++;
        }

        yield {
            type: 'BEFORE_LEAF_INSERT',
            nodeId: leaf.id,
            nodeKeys: [...leaf.keys],
            key: key,
            insertIndex: insertIndex,
            message: `Insertando ${key} en el nodo hoja B+ ${leaf.id} (posición: ${insertIndex}).`,
            reads,
            writes
        };

        leaf.keys.splice(insertIndex, 0, key);
        writes++;

        yield {
            type: 'AFTER_LEAF_INSERT',
            nodeId: leaf.id,
            nodeKeys: [...leaf.keys],
            key: key,
            message: `Clave ${key} insertada en la hoja.`,
            reads,
            writes
        };

        let node = leaf;

        while (node.keys.length > this.maxKeys) {
            yield {
                type: 'OVERFLOW_DETECTED',
                nodeId: node.id,
                nodeKeys: [...node.keys],
                maxKeys: this.maxKeys,
                message: `Overflow en B+ en el nodo ${node.id} (${node.keys.length} claves).`,
                reads,
                writes
            };

            const promoIndex = Math.floor(node.keys.length / 2);
            const promoKey = node.keys[promoIndex];

            yield {
                type: 'CHOOSE_PROMOTION',
                nodeId: node.id,
                nodeKeys: [...node.keys],
                promoIndex: promoIndex,
                promoKey: promoKey,
                message: `En Árbol B+, seleccionando divisor. Para el nodo ${node.id}, la clave divisora es ${promoKey}.`,
                reads,
                writes
            };

            let leftKeys, rightKeys;
            let leftChildren = [];
            let rightChildren = [];

            const rightNode = new BPlusTreeNode(node.isLeaf);

            if (node.isLeaf) {
                // DIVISIÓN DE HOJA: Duplicar la clave promocionada.
                // Izquierda: [0 a promoIndex - 1]
                // Derecha: [promoIndex a length - 1] (mantiene la clave promoKey!)
                leftKeys = node.keys.slice(0, promoIndex);
                rightKeys = node.keys.slice(promoIndex);

                node.keys = leftKeys;
                rightNode.keys = rightKeys;

                // Mantener lista secuencial de hojas
                rightNode.next = node.next;
                if (node.next) node.next.prev = rightNode;
                node.next = rightNode;
                rightNode.prev = node;

                writes += 2; // Grabamos hoja izq y nueva hoja der

                yield {
                    type: 'SPLIT_NODE',
                    leftNodeId: node.id,
                    leftKeys: [...node.keys],
                    rightNodeId: rightNode.id,
                    rightKeys: [...rightNode.keys],
                    promoKey: promoKey,
                    message: `Partición de Hoja B+ (Clave ${promoKey} se duplica en la hoja derecha). Izq: [${node.keys.join(', ')}]. Der: [${rightNode.keys.join(', ')}].`,
                    reads,
                    writes
                };
            } else {
                // DIVISIÓN DE NODO INTERNO: Mover la clave promocionada (igual que árbol B).
                leftKeys = node.keys.slice(0, promoIndex);
                rightKeys = node.keys.slice(promoIndex + 1);

                leftChildren = node.children.slice(0, promoIndex + 1);
                rightChildren = node.children.slice(promoIndex + 1);

                node.keys = leftKeys;
                node.children = leftChildren;
                rightNode.keys = rightKeys;
                rightNode.children = rightChildren;

                writes += 2;

                yield {
                    type: 'SPLIT_NODE',
                    leftNodeId: node.id,
                    leftKeys: [...node.keys],
                    rightNodeId: rightNode.id,
                    rightKeys: [...rightNode.keys],
                    promoKey: promoKey,
                    message: `Partición de Nodo Interno B+ (Clave ${promoKey} sube y se elimina del nivel). Izq: [${node.keys.join(', ')}]. Der: [${rightNode.keys.join(', ')}].`,
                    reads,
                    writes
                };
            }

            if (path.length <= 1) {
                // Crear nueva raíz
                const newRoot = new BPlusTreeNode(false);
                newRoot.keys = [promoKey];
                newRoot.children = [node, rightNode];
                treeRoot = newRoot;
                writes++;

                yield {
                    type: 'NEW_ROOT',
                    rootId: treeRoot.id,
                    rootKeys: [...treeRoot.keys],
                    leftId: node.id,
                    rightId: rightNode.id,
                    message: `Nueva raíz B+ creada con clave divisora ${promoKey}.`,
                    reads,
                    writes
                };
                break;
            } else {
                path.pop();
                const parent = path[path.length - 1];

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
                    message: `Promocionando clave ${promoKey} al padre B+ ${parent.id}.`,
                    reads,
                    writes
                };

                parent.keys.splice(insertPos, 0, promoKey);
                parent.children.splice(insertPos + 1, 0, rightNode);
                writes++;

                node = parent;
            }
        }

        yield {
            type: 'INSERT_COMPLETED',
            rootId: treeRoot.id,
            message: `Inserción B+ finalizada.`,
            reads,
            writes
        };

        return { root: treeRoot, reads, writes, success: true };
    }

    /**
     * Eliminación en Árbol B+:
     * - Las claves se borran directamente de las hojas.
     * - En la redistribución de hojas, las claves rotan de forma directa entre hojas y el padre se actualiza con la menor clave del hermano derecho.
     * - En la fusión de hojas, no baja clave del padre (ya que todas las claves ya están en las hojas); el padre solo pierde la clave divisora.
     */
    *deleteGenerator(root, key, policy = 'izquierdaODer') {
        let treeRoot = root ? root.clone() : null;
        let writes = 0;

        if (!treeRoot) {
            yield {
                type: 'DELETE_EMPTY',
                message: 'El árbol B+ está vacío.',
                reads: 0,
                writes: 0
            };
            return { root: null, reads: 0, writes: 0, success: false };
        }

        const searchResult = yield* this.searchGenerator(treeRoot, key);
        let reads = searchResult.reads;

        if (!searchResult.found) {
            yield {
                type: 'DELETE_NOT_FOUND',
                key: key,
                message: `Error: La clave ${key} no existe en las hojas del árbol B+.`,
                reads,
                writes
            };
            return { root: treeRoot, reads, writes, success: false };
        }

        const path = searchResult.path;
        let node = path[path.length - 1];
        let deleteIdx = node.keys.indexOf(key);

        yield {
            type: 'BEFORE_LEAF_DELETE',
            nodeId: node.id,
            nodeKeys: [...node.keys],
            keyToDelete: key,
            deleteIdx: deleteIdx,
            message: `Eliminando ${key} de la hoja B+ ${node.id}.`,
            reads,
            writes
        };

        node.keys.splice(deleteIdx, 1);
        writes++;

        yield {
            type: 'AFTER_LEAF_DELETE',
            nodeId: node.id,
            nodeKeys: [...node.keys],
            message: `Clave eliminada de la hoja B+. Claves: [${node.keys.join(', ')}].`,
            reads,
            writes
        };

        while (node.keys.length < this.minKeys) {
            if (node === treeRoot) {
                if (treeRoot.keys.length === 0 && treeRoot.children.length > 0) {
                    treeRoot = treeRoot.children[0];
                    writes++;
                    yield {
                        type: 'DECREASE_HEIGHT',
                        newRootId: treeRoot.id,
                        message: `La raíz B+ quedó vacía. El hijo se convierte en la nueva raíz.`,
                        reads,
                        writes
                    };
                }
                break;
            }

            yield {
                type: 'UNDERFLOW_DETECTED',
                nodeId: node.id,
                nodeKeys: [...node.keys],
                minKeys: this.minKeys,
                message: `Underflow en B+ detectado en nodo ${node.id} (${node.keys.length} claves).`,
                reads,
                writes
            };

            path.pop();
            const parent = path[path.length - 1];
            const nodeIdx = parent.children.indexOf(node);

            let leftSibling = nodeIdx > 0 ? parent.children[nodeIdx - 1] : null;
            let rightSibling = nodeIdx < parent.children.length - 1 ? parent.children[nodeIdx + 1] : null;

            let resolved = false;
            const canBorrow = (sib) => sib && sib.keys.length - 1 >= this.minKeys;

            const tryLeftRedistribution = () => {
                if (canBorrow(leftSibling)) {
                    if (node.isLeaf) {
                        // REDISTRIBUCIÓN EN HOJA:
                        // Pasamos la clave directamente de la hoja hermana izquierda a la hoja actual
                        const borrowedKey = leftSibling.keys.pop();
                        node.keys.unshift(borrowedKey);

                        // Actualizar la clave divisora en el padre con el nuevo mínimo de la hoja derecha
                        const parentKeyIdx = nodeIdx - 1;
                        parent.keys[parentKeyIdx] = node.keys[0];
                        
                        writes += 3;
                        return { success: true, type: 'REDISTRIBUTE_LEFT', msg: `Redistribución en hojas B+: Se mueve la clave ${borrowedKey} del hermano izquierdo al inicio del nodo ${node.id}. El padre actualiza el divisor a ${node.keys[0]}.` };
                    } else {
                        // NODO INTERNO: Igual a Árbol B
                        const parentKeyIdx = nodeIdx - 1;
                        const parentKey = parent.keys[parentKeyIdx];
                        const siblingKey = leftSibling.keys.pop();
                        node.keys.unshift(parentKey);
                        parent.keys[parentKeyIdx] = siblingKey;

                        const siblingChild = leftSibling.children.pop();
                        node.children.unshift(siblingChild);

                        writes += 3;
                        return { success: true, type: 'REDISTRIBUTE_LEFT', msg: `Redistribución interna B+: La clave del padre ${parentKey} baja y sube ${siblingKey}.` };
                    }
                }
                return { success: false };
            };

            const tryRightRedistribution = () => {
                if (canBorrow(rightSibling)) {
                    if (node.isLeaf) {
                        // REDISTRIBUCIÓN EN HOJA:
                        // Pasamos la clave directamente del hermano derecho
                        const borrowedKey = rightSibling.keys.shift();
                        node.keys.push(borrowedKey);

                        // El divisor en el padre se actualiza con el nuevo mínimo del hermano derecho
                        const parentKeyIdx = nodeIdx;
                        parent.keys[parentKeyIdx] = rightSibling.keys[0];

                        writes += 3;
                        return { success: true, type: 'REDISTRIBUTE_RIGHT', msg: `Redistribución en hojas B+: Se mueve ${borrowedKey} del hermano derecho. El padre actualiza el divisor a ${rightSibling.keys[0]}.` };
                    } else {
                        // NODO INTERNO
                        const parentKeyIdx = nodeIdx;
                        const parentKey = parent.keys[parentKeyIdx];
                        const siblingKey = rightSibling.keys.shift();
                        node.keys.push(parentKey);
                        parent.keys[parentKeyIdx] = siblingKey;

                        const siblingChild = rightSibling.children.shift();
                        node.children.push(siblingChild);

                        writes += 3;
                        return { success: true, type: 'REDISTRIBUTE_RIGHT', msg: `Redistribución interna B+: Se rota con el hermano derecho.` };
                    }
                }
                return { success: false };
            };

            const mergeWithLeft = () => {
                const parentKeyIdx = nodeIdx - 1;
                const parentKey = parent.keys[parentKeyIdx];

                if (node.isLeaf) {
                    // FUSIÓN EN HOJA:
                    // NO baja clave del padre a las claves del nodo hoja.
                    // Las hojas ya contienen la información. Solo concatenamos claves.
                    leftSibling.keys.push(...node.keys);
                    leftSibling.next = node.next;
                    if (node.next) node.next.prev = leftSibling;

                    // El padre pierde la clave divisora y el puntero al hijo
                    parent.keys.splice(parentKeyIdx, 1);
                    parent.children.splice(nodeIdx, 1);

                    writes += 2;
                    return { type: 'MERGE_LEFT', msg: `Fusión en hojas B+: Las hojas se unen. Se elimina el nodo ${node.id} y la clave separadora del padre ${parentKey} se remueve sin bajar a la hoja.` };
                } else {
                    // NODO INTERNO: Baja la clave del padre
                    leftSibling.keys.push(parentKey, ...node.keys);
                    leftSibling.children.push(...node.children);

                    parent.keys.splice(parentKeyIdx, 1);
                    parent.children.splice(nodeIdx, 1);

                    writes += 2;
                    return { type: 'MERGE_LEFT', msg: `Fusión interna B+: Se baja la clave del padre ${parentKey}.` };
                }
            };

            const mergeWithRight = () => {
                const parentKeyIdx = nodeIdx;
                const parentKey = parent.keys[parentKeyIdx];

                if (node.isLeaf) {
                    // FUSIÓN EN HOJA
                    node.keys.push(...rightSibling.keys);
                    node.next = rightSibling.next;
                    if (rightSibling.next) rightSibling.next.prev = node;

                    parent.keys.splice(parentKeyIdx, 1);
                    parent.children.splice(nodeIdx + 1, 1);

                    writes += 2;
                    return { type: 'MERGE_RIGHT', msg: `Fusión en hojas B+: Fusión con hermano derecho ${rightSibling.id}.` };
                } else {
                    // NODO INTERNO
                    node.keys.push(parentKey, ...rightSibling.keys);
                    node.children.push(...rightSibling.children);

                    parent.keys.splice(parentKeyIdx, 1);
                    parent.children.splice(nodeIdx + 1, 1);

                    writes += 2;
                    return { type: 'MERGE_RIGHT', msg: `Fusión interna B+: Fusión con hermano derecho.` };
                }
            };

            let action = null;
            // Políticas de flujo
            if (policy === 'izquierda') {
                action = tryLeftRedistribution();
                if (action.success) {
                    resolved = true;
                } else {
                    action = leftSibling ? mergeWithLeft() : (canBorrow(rightSibling) ? tryRightRedistribution() : mergeWithRight());
                }
            } else if (policy === 'derecha') {
                action = tryRightRedistribution();
                if (action.success) {
                    resolved = true;
                } else {
                    action = rightSibling ? mergeWithRight() : (canBorrow(leftSibling) ? tryLeftRedistribution() : mergeWithLeft());
                }
            } else if (policy === 'izquierdaODer' || policy === 'izquierdaYDerecha') {
                action = tryLeftRedistribution();
                if (action.success) {
                    resolved = true;
                } else {
                    action = tryRightRedistribution();
                    if (action.success) {
                        resolved = true;
                    } else {
                        action = leftSibling ? mergeWithLeft() : mergeWithRight();
                    }
                }
            } else if (policy === 'derOIzq') {
                action = tryRightRedistribution();
                if (action.success) {
                    resolved = true;
                } else {
                    action = tryLeftRedistribution();
                    if (action.success) {
                        resolved = true;
                    } else {
                        action = rightSibling ? mergeWithRight() : mergeWithLeft();
                    }
                }
            }

            yield {
                type: action.type,
                nodeId: node.id,
                parentId: parent.id,
                siblingId: leftSibling ? leftSibling.id : (rightSibling ? rightSibling.id : null),
                message: action.msg,
                reads,
                writes
            };

            if (resolved) {
                break;
            } else {
                node = parent;
            }
        }

        yield {
            type: 'DELETE_COMPLETED',
            rootId: treeRoot.id,
            message: `Eliminación B+ finalizada con éxito.`,
            reads,
            writes
        };

        return { root: treeRoot, reads, writes, success: true };
    }
}

class BStarTreeNode extends BTreeNode {
    constructor(isLeaf = true) {
        super(isLeaf);
    }

    clone() {
        const copy = new BStarTreeNode(this.isLeaf);
        copy.id = this.id;
        copy.keys = [...this.keys];
        copy.children = this.children.map(child => child.clone());
        return copy;
    }
}

class BStarTreeEngine {
    constructor(M = 4) {
        this.M = M;
        this.maxKeys = M - 1;
        
        // FÓRMULA DE OCUPACIÓN MÍNIMA DE B* (FOD UNLP / HEA):
        // En HEA se calcula como: Math.floor(((M * 2) - 1) / 3) - 1
        // NOTA DOCENTE / BIBLIOGRÁFICA:
        // El libro clásico de Donald Knuth (The Art of Computer Programming, Vol 3)
        // define la ocupación mínima en B* como dos tercios, es decir: Math.ceil(((M * 2) - 1) / 3) - 1.
        // Como se acordó en el plan de diseño, seguimos la fórmula empírica de HEA con redondeo floor.
        this.minKeys = Math.floor(((M * 2) - 1) / 3) - 1;
        this.dosTercios = Math.floor(((M * 2) - 1) / 3);
    }

    /**
     * Búsqueda en B* Tree: Idéntica a Árbol B Estándar.
     */
    *searchGenerator(root, key) {
        // Reutilizamos la lógica del BTreeEngine clásico ya que la navegación es la misma
        const btreeEngine = new BTreeEngine(this.M);
        return yield* btreeEngine.searchGenerator(root, key);
    }

    /**
     * Inserción en Árbol B*:
     * - Si hay overflow, intenta redistribuir con un hermano adyacente.
     * - Si el hermano está lleno, hace una división 2-a-3.
     */
    *insertGenerator(root, key, policy = 'izquierdaODer') {
        let treeRoot = root ? root.clone() : new BStarTreeNode(true);
        let writes = 0;

        const searchResult = yield* this.searchGenerator(treeRoot, key);
        let reads = searchResult.reads;

        if (searchResult.found) {
            yield {
                type: 'INSERT_DUPLICATE',
                key: key,
                message: `Error: La clave ${key} ya existe en el árbol B*.`,
                reads,
                writes
            };
            return { root: treeRoot, reads, writes, success: false };
        }

        const path = searchResult.path;
        let leaf = path[path.length - 1];

        if (!leaf) {
            leaf = new BStarTreeNode(true);
            treeRoot = leaf;
            path.push(leaf);
        }

        let insertIndex = 0;
        while (insertIndex < leaf.keys.length && key > leaf.keys[insertIndex]) {
            insertIndex++;
        }

        yield {
            type: 'BEFORE_LEAF_INSERT',
            nodeId: leaf.id,
            nodeKeys: [...leaf.keys],
            key: key,
            insertIndex: insertIndex,
            message: `Insertando ${key} en el nodo hoja B* ${leaf.id} (posición: ${insertIndex}).`,
            reads,
            writes
        };

        leaf.keys.splice(insertIndex, 0, key);
        writes++;

        yield {
            type: 'AFTER_LEAF_INSERT',
            nodeId: leaf.id,
            nodeKeys: [...leaf.keys],
            key: key,
            message: `Clave ${key} insertada en la hoja B*.`,
            reads,
            writes
        };

        let node = leaf;

        while (node.keys.length > this.maxKeys) {
            yield {
                type: 'OVERFLOW_DETECTED',
                nodeId: node.id,
                nodeKeys: [...node.keys],
                maxKeys: this.maxKeys,
                message: `¡Overflow B* detectado en el nodo ${node.id}! (Capacidad superada: ${node.keys.length} claves).`,
                reads,
                writes
            };

            if (node === treeRoot) {
                // CASO ESPECIAL: La raíz del árbol B* se divide como un árbol B estándar (1 a 2)
                const promoIndex = Math.floor(node.keys.length / 2);
                const promoKey = node.keys[promoIndex];

                yield {
                    type: 'CHOOSE_PROMOTION',
                    nodeId: node.id,
                    nodeKeys: [...node.keys],
                    promoIndex: promoIndex,
                    promoKey: promoKey,
                    message: `La raíz B* desbordada se dividirá de forma clásica. Seleccionada clave ${promoKey}.`,
                    reads,
                    writes
                };

                const leftKeys = node.keys.slice(0, promoIndex);
                const rightKeys = node.keys.slice(promoIndex + 1);

                let leftChildren = [];
                let rightChildren = [];
                if (!node.isLeaf) {
                    leftChildren = node.children.slice(0, promoIndex + 1);
                    rightChildren = node.children.slice(promoIndex + 1);
                }

                const rightNode = new BStarTreeNode(node.isLeaf);
                rightNode.keys = rightKeys;
                rightNode.children = rightChildren;

                node.keys = leftKeys;
                node.children = leftChildren;

                const newRoot = new BStarTreeNode(false);
                newRoot.keys = [promoKey];
                newRoot.children = [node, rightNode];
                
                treeRoot = newRoot;
                writes += 3; // Modificar raíz vieja, crear raíz nueva y crear hermano derecho

                yield {
                    type: 'NEW_ROOT',
                    rootId: treeRoot.id,
                    rootKeys: [...treeRoot.keys],
                    leftId: node.id,
                    rightId: rightNode.id,
                    message: `Se crea una nueva raíz B* (Nodo ${treeRoot.id}) tras dividir la raíz anterior.`,
                    reads,
                    writes
                };
                break;
            }

            // Si no es raíz, buscamos hermanos para redistribuir antes de dividir (característica B*)
            path.pop();
            const parent = path[path.length - 1];
            const nodeIdx = parent.children.indexOf(node);

            let leftSibling = nodeIdx > 0 ? parent.children[nodeIdx - 1] : null;
            let rightSibling = nodeIdx < parent.children.length - 1 ? parent.children[nodeIdx + 1] : null;

            let redistributed = false;

            const tryLeftRedistribute = () => {
                if (leftSibling && leftSibling.keys.length < this.maxKeys) {
                    // Redistribuir a la izquierda
                    const parentKeyIdx = nodeIdx - 1;
                    const parentKey = parent.keys[parentKeyIdx];

                    // Tomamos el elemento más chico del nodo desbordado
                    const transferKey = node.keys.shift();

                    // La clave del padre baja al hermano izquierdo
                    leftSibling.keys.push(parentKey);
                    // La clave transferida sube al padre
                    parent.keys[parentKeyIdx] = transferKey;

                    if (!node.isLeaf) {
                        const transferChild = node.children.shift();
                        leftSibling.children.push(transferChild);
                    }

                    writes += 3;
                    return { success: true, type: 'REDISTRIBUTE_LEFT', msg: `Redistribución B* a izquierda: Hermano izquierdo ${leftSibling.id} tiene espacio. Clave del padre ${parentKey} baja, y clave ${transferKey} sube al padre.` };
                }
                return { success: false };
            };

            const tryRightRedistribute = () => {
                if (rightSibling && rightSibling.keys.length < this.maxKeys) {
                    // Redistribuir a la derecha
                    const parentKeyIdx = nodeIdx;
                    const parentKey = parent.keys[parentKeyIdx];

                    // Tomamos el elemento más grande del nodo desbordado
                    const transferKey = node.keys.pop();

                    // La clave del padre baja al hermano derecho
                    rightSibling.keys.unshift(parentKey);
                    // La clave transferida sube al padre
                    parent.keys[parentKeyIdx] = transferKey;

                    if (!node.isLeaf) {
                        const transferChild = node.children.pop();
                        rightSibling.children.unshift(transferChild);
                    }

                    writes += 3;
                    return { success: true, type: 'REDISTRIBUTE_RIGHT', msg: `Redistribución B* a derecha: Hermano derecho ${rightSibling.id} tiene espacio. Clave del padre ${parentKey} baja, y clave ${transferKey} sube al padre.` };
                }
                return { success: false };
            };

            // Evaluar según la política
            let action = { success: false };
            if (policy === 'izquierda') {
                action = tryLeftRedistribute();
            } else if (policy === 'derecha') {
                action = tryRightRedistribute();
            } else if (policy === 'izquierdaODer' || policy === 'izquierdaYDerecha') {
                action = tryLeftRedistribute();
                if (!action.success) action = tryRightRedistribute();
            } else if (policy === 'derOIzq') {
                action = tryRightRedistribute();
                if (!action.success) action = tryLeftRedistribute();
            }

            if (action.success) {
                yield {
                    type: action.type,
                    nodeId: node.id,
                    parentId: parent.id,
                    siblingId: leftSibling ? leftSibling.id : (rightSibling ? rightSibling.id : null),
                    message: action.msg,
                    reads,
                    writes
                };
                redistributed = true;
                break; // Overflow solucionado sin partición!
            }

            // Si no fue posible redistribuir (porque los hermanos están llenos), realizamos split 2-a-3.
            // Para mantener la lógica limpia, elegimos el hermano según la política disponible.
            let siblingToSplit = leftSibling || rightSibling;
            let mergeDir = leftSibling ? 'izquierda' : 'derecha';
            let parentKeyIdx = leftSibling ? nodeIdx - 1 : nodeIdx;

            if (policy === 'derecha' && rightSibling) {
                siblingToSplit = rightSibling;
                mergeDir = 'derecha';
                parentKeyIdx = nodeIdx;
            }

            const parentKey = parent.keys[parentKeyIdx];

            yield {
                type: 'BSTAR_SPLIT_START',
                nodeId: node.id,
                siblingId: siblingToSplit.id,
                message: `Hermanos llenos. Iniciando split 2-a-3 entre nodo ${node.id} y su hermano ${siblingToSplit.id}.`,
                reads,
                writes
            };

            // Agrupar todas las claves en un vector total ordenado
            let allKeys = [];
            let allChildren = [];

            if (mergeDir === 'izquierda') {
                allKeys = [...siblingToSplit.keys, parentKey, ...node.keys];
                if (!node.isLeaf) {
                    allChildren = [...siblingToSplit.children, ...node.children];
                }
            } else {
                allKeys = [...node.keys, parentKey, ...siblingToSplit.keys];
                if (!node.isLeaf) {
                    allChildren = [...node.children, ...siblingToSplit.children];
                }
            }

            // Dividir las claves agrupadas en 3 nodos utilizando el umbral dosTercios
            // Node 1 (izq): [0 a dosTercios - 1]
            // Promo 1: dosTercios
            // Node 2 (centro): [dosTercios + 1 a dosTercios * 2]
            // Promo 2: dosTercios * 2 + 1
            // Node 3 (der): [dosTercios * 2 + 2 a fin]
            const firstPromoKey = allKeys[this.dosTercios];
            const secondPromoKey = allKeys[this.dosTercios * 2 + 1];

            const keys1 = allKeys.slice(0, this.dosTercios);
            const keys2 = allKeys.slice(this.dosTercios + 1, this.dosTercios * 2 + 1);
            const keys3 = allKeys.slice(this.dosTercios * 2 + 2);

            let children1 = [], children2 = [], children3 = [];
            if (!node.isLeaf) {
                children1 = allChildren.slice(0, this.dosTercios + 1);
                children2 = allChildren.slice(this.dosTercios + 1, this.dosTercios * 2 + 2);
                children3 = allChildren.slice(this.dosTercios * 2 + 2);
            }

            // Reutilizar el nodo original y el hermano
            const node1 = siblingToSplit;
            node1.keys = mergeDir === 'izquierda' ? keys1 : keys3; // Mantener orden original de punteros
            node1.children = mergeDir === 'izquierda' ? children1 : children3;

            const node3 = node;
            node3.keys = mergeDir === 'izquierda' ? keys3 : keys1;
            node3.children = mergeDir === 'izquierda' ? children3 : children1;

            // Crear el nuevo nodo central
            const node2 = new BStarTreeNode(node.isLeaf);
            node2.keys = keys2;
            node2.children = children2;

            // Reorganizar en el padre
            // Reemplazar la clave divisora vieja por las dos nuevas, e insertar el nuevo hijo intermedio
            parent.keys.splice(parentKeyIdx, 1, firstPromoKey, secondPromoKey);
            
            // Insertar el nuevo nodo intermedio
            if (mergeDir === 'izquierda') {
                parent.children[nodeIdx - 1] = node1;
                parent.children[nodeIdx] = node3;
                parent.children.splice(nodeIdx, 0, node2);
            } else {
                parent.children[nodeIdx] = node3;
                parent.children[nodeIdx + 1] = node1;
                parent.children.splice(nodeIdx + 1, 0, node2);
            }

            writes += 4; // Modificar 2 viejos, crear 1 nuevo, modificar padre

            yield {
                type: 'BSTAR_SPLIT_DONE',
                promoKeys: [firstPromoKey, secondPromoKey],
                message: `Split 2-a-3 completado. Nuevos nodos: [${node1.keys.join(', ')}], [${node2.keys.join(', ')}], [${node3.keys.join(', ')}]. Promocionando claves [${firstPromoKey}, ${secondPromoKey}] al padre.`,
                reads,
                writes
            };

            // El padre ahora tiene una clave extra. Esto puede provocar un overflow en el padre
            node = parent;
        }

        yield {
            type: 'INSERT_COMPLETED',
            rootId: treeRoot.id,
            message: `Inserción B* finalizada.`,
            reads,
            writes
        };

        return { root: treeRoot, reads, writes, success: true };
    }

    /**
     * Eliminación en Árbol B*: Idéntica a Árbol B pero utilizando la ocupación mínima de B*
     * y permitiendo propagación según las políticas lógicas.
     */
    *deleteGenerator(root, key, policy = 'izquierdaODer') {
        const btreeEngine = new BTreeEngine(this.M);
        // Sobrescribimos el mínimo de claves temporalmente para usar la regla de B*
        btreeEngine.minKeys = this.minKeys;
        return yield* btreeEngine.deleteGenerator(root, key, policy);
    }
}
