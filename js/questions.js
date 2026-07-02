/**
 * questions.js
 * Módulo encargado de generar preguntas de opción múltiple con fines didácticos,
 * basadas en el paso actual de ejecución del árbol B.
 * 
 * Los distractores corresponden a errores conceptuales típicos de estudiantes.
 */

class QuestionGenerator {
    /**
     * Genera una pregunta a partir del evento del motor lógico.
     * 
     * @param {object} stepEvent - El evento emitido por el generador de engine.js
     * @returns {object|null} Un objeto con la estructura de la pregunta, o null si el paso no requiere pregunta
     */
    static generateQuestion(stepEvent) {
        if (!stepEvent) return null;

        switch (stepEvent.type) {
            case 'BEFORE_LEAF_INSERT':
                return this.makeBeforeLeafInsertQuestion(stepEvent);

            case 'OVERFLOW_DETECTED':
                return this.makeOverflowDetectedQuestion(stepEvent);

            case 'CHOOSE_PROMOTION':
                return this.makeChoosePromotionQuestion(stepEvent);

            case 'SPLIT_NODE':
                return this.makeSplitNodeQuestion(stepEvent);

            case 'SEARCH_DESCEND':
                return this.makeSearchDescendQuestion(stepEvent);

            case 'BEFORE_SWAP_SUCCESSOR':
                return this.makeBeforeSwapSuccessorQuestion(stepEvent);

            case 'BEFORE_LEAF_DELETE':
                return this.makeBeforeLeafDeleteQuestion(stepEvent);

            case 'UNDERFLOW_DETECTED':
                return this.makeUnderflowDetectedQuestion(stepEvent);

            case 'REDISTRIBUTE_LEFT':
            case 'REDISTRIBUTE_RIGHT':
                return this.makeRedistributeQuestion(stepEvent);

            case 'MERGE_LEFT':
            case 'MERGE_RIGHT':
                return this.makeMergeQuestion(stepEvent);

            default:
                return null;
        }
    }

    /**
     * Pregunta para decidir la posición de inserción secuencial.
     */
    static makeBeforeLeafInsertQuestion(event) {
        const { key, nodeKeys, insertIndex, nodeId } = event;
        const keysText = nodeKeys.length > 0 ? `[${nodeKeys.join(', ')}]` : 'vacío';
        
        const questionText = `Queremos insertar la clave ${key} en el nodo hoja ${nodeId} que actualmente contiene ${keysText}. ¿En qué posición relativa (índice 0) debe colocarse temporalmente la clave para mantener el orden ascendente?`;

        // Generamos opciones
        const options = [
            `En el índice ${insertIndex}.`, // Correcta
            `Al inicio del nodo (índice 0) sin importar las claves actuales.`,
            `Al final del nodo (índice ${nodeKeys.length}) sin evaluar el orden.`,
            `En el índice ${insertIndex + 1}.`
        ];

        const correctIndex = 0;
        
        const feedback = [
            `¡Correcto! La clave ${key} es mayor que las primeras ${insertIndex} claves del nodo, por lo que debe ubicarse ordenadamente en la posición ${insertIndex}.`,
            `Incorrecto. Las claves de los nodos en un árbol B deben almacenarse siempre de manera ordenada.`,
            `Incorrecto. Si la clave se inserta al final sin ordenar, se rompería la propiedad de orden del árbol.`,
            `Incorrecto. Colocarla en la posición ${insertIndex + 1} dejaría un elemento mayor antes de un elemento menor, rompiendo el orden.`
        ];

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta sobre la identificación del overflow y el tamaño máximo.
     */
    static makeOverflowDetectedQuestion(event) {
        const { nodeId, nodeKeys, maxKeys } = event;
        const questionText = `El nodo ${nodeId} tiene las claves [${nodeKeys.join(', ')}] (cantidad: ${nodeKeys.length}). Si el máximo permitido para un nodo de este orden es ${maxKeys}, ¿qué estado se ha producido y qué acción corresponde?`;

        const options = [
            `Se ha producido un Overflow. Se debe particionar (split) el nodo y promocionar una clave al padre.`, // Correcta
            `Se ha producido un Underflow. Se debe fusionar este nodo inmediatamente con su hermano izquierdo.`,
            `El nodo se encuentra en estado normal porque la capacidad máxima es igual al orden M.`,
            `Se ha producido un Overflow. Se debe eliminar la clave de menor valor para hacer espacio.`
        ];

        const correctIndex = 0;

        const feedback = [
            `¡Correcto! Dado que la cantidad de claves (${nodeKeys.length}) supera el máximo permitido (${maxKeys}), el nodo está saturado (overflow) y se debe dividir.`,
            `Incorrecto. El underflow ocurre cuando un nodo queda por debajo del número mínimo de claves permitidas, no por encima del máximo.`,
            `Incorrecto. El orden M representa el número máximo de HIJOS. La capacidad máxima de CLAVES es M-1 (${maxKeys}).`,
            `Incorrecto. Las claves nunca se descartan arbitrariamente en una inserción; se debe reestructurar el árbol mediante una partición.`
        ];

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta crítica sobre qué clave sube en la partición.
     */
    static makeChoosePromotionQuestion(event) {
        const { nodeKeys, promoIndex, promoKey, nodeId } = event;
        
        const questionText = `Durante la partición del nodo ${nodeId} con claves [${nodeKeys.join(', ')}], ¿cuál es el elemento que debe ser seleccionado para promocionar (subir) al padre según la convención de la cátedra (HEA)?`;

        // Generamos distractores basados en índices adyacentes
        const optCorrect = `La clave ${promoKey} (ubicada en la mitad, índice ${promoIndex}).`;
        
        let optLeftDistractor = `La clave ${nodeKeys[promoIndex - 1]} (índice ${promoIndex - 1}).`;
        let optRightDistractor = `La clave ${nodeKeys[promoIndex + 1]} (índice ${promoIndex + 1}).`;
        let optExtremity = `La clave de mayor valor (${nodeKeys[nodeKeys.length - 1]}) para que los hijos queden limpios.`;

        // Barajamos las opciones y guardamos el índice de la correcta
        const rawOptions = [
            { text: optCorrect, correct: true, feedbackText: `¡Correcto! Según la convención de división, la clave del medio se calcula con Math.floor(claves.length / 2), que nos da la clave ${promoKey} en la posición ${promoIndex}.` },
            { text: optLeftDistractor, correct: false, feedbackText: `Incorrecto. Elegir la clave ${nodeKeys[promoIndex - 1]} corresponde a un redondeo incorrecto hacia la izquierda; no divide las claves restantes de manera equitativa.` },
            { text: optRightDistractor, correct: false, feedbackText: `Incorrecto. Elegir la clave ${nodeKeys[promoIndex + 1]} corresponde a un redondeo hacia la derecha; no coincide con la fórmula Math.floor(longitud/2) de la cátedra.` },
            { text: optExtremity, correct: false, feedbackText: `Incorrecto. Promocionar la clave máxima dejaría al hijo derecho vacío y al izquierdo con todos los elementos, rompiendo el balance del árbol.` }
        ];

        // Mezclar las opciones pero mantener el rastro de la correcta
        const options = rawOptions.map(o => o.text);
        const correctIndex = rawOptions.findIndex(o => o.correct);
        const feedback = rawOptions.map(o => o.feedbackText);

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta sobre la redistribución de claves en los nuevos hijos de la partición (B vs B+).
     */
    static makeSplitNodeQuestion(event) {
        const { leftKeys, rightKeys, promoKey } = event;
        
        const questionText = `Luego de decidir promocionar la clave ${promoKey}, ¿cómo se deben distribuir las claves restantes entre los dos nodos hijos resultantes (izquierdo y derecho) en este Árbol B?`;

        const options = [
            `Izquierda: [${leftKeys.join(', ')}], Derecha: [${rightKeys.join(', ')}]. La clave promocionada no se duplica en los hijos.`, // Correcta
            `Izquierda: [${leftKeys.join(', ')}, ${promoKey}], Derecha: [${rightKeys.join(', ')}]. Se duplica en el hijo izquierdo.`,
            `Izquierda: [${leftKeys.join(', ')}], Derecha: [${promoKey}, ${rightKeys.join(', ')}]. Se duplica en el hijo derecho.`,
            `Izquierda y derecha reciben todas las claves originales incluyendo la promocionada en ambos lados.`
        ];

        const correctIndex = 0;

        const feedback = [
            `¡Correcto! En un Árbol B estándar, la clave promocionada sube al padre y desaparece completamente de los nodos hijos. No se permite duplicar información.`,
            `Incorrecto. Mantener la clave promocionada en el hijo izquierdo es una propiedad de división específica de los árboles B+, pero en árboles B clásicos no debe duplicarse.`,
            `Incorrecto. Mantener la clave promocionada en el hijo derecho es común en árboles B+ (donde las hojas contienen todas las claves), pero incorrecto en un árbol B estándar.`,
            `Incorrecto. Duplicar la clave promocionada en ambos nodos hijos viola las propiedades estructurales básicas del árbol B.`
        ];

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta para decidir por qué hijo descender en la búsqueda.
     */
    static makeSearchDescendQuestion(event) {
        const { keys, searchKey, childIndex, nodeId } = event;
        
        const questionText = `Buscando la clave ${searchKey} en el nodo ${nodeId} que contiene claves [${keys.join(', ')}], ¿por qué puntero hijo (índice 0 a ${keys.length}) debemos continuar el descenso?`;

        const options = [
            `Por el puntero del índice ${childIndex}.`, // Correcta
            `Por el puntero del índice ${childIndex === 0 ? 1 : childIndex - 1}.`,
            `Por el puntero de menor índice posible (0) siempre, para asegurar el recorrido exhaustivo.`,
            `No debemos descender; la clave se debería insertar directamente en este nodo interno.`
        ];

        const correctIndex = 0;

        const feedback = [
            `¡Correcto! La clave ${searchKey} cumple las condiciones de límite para caer en el subárbol apuntado por el índice ${childIndex}.`,
            `Incorrecto. Seguir esa rama nos llevaría a un subárbol con claves fuera del rango correspondiente a ${searchKey}.`,
            `Incorrecto. Descender siempre por el índice 0 ignoraría las propiedades de ordenación del árbol B, asemejándose a una búsqueda lineal desordenada.`,
            `Incorrecto. Las inserciones en un árbol B siempre se realizan en los nodos hoja. Los nodos internos solo guían el camino.`
        ];

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta sobre el intercambio con el sucesor inmediato en caso de borrado en nodo interno.
     */
    static makeBeforeSwapSuccessorQuestion(event) {
        const { nodeId, key, successorNodeId, successorKey } = event;
        
        const questionText = `La clave ${key} a eliminar se encuentra en el nodo interno ${nodeId}. Para mantener la propiedad de orden del árbol, ¿con cuál de sus descendientes debe ser intercambiada antes de removerla?`;

        const options = [
            `Con la clave ${successorKey} (el elemento más pequeño del subárbol derecho, ubicado en la hoja ${successorNodeId}).`, // Correcta
            `Con la clave de mayor valor del subárbol izquierdo inmediato (el predecesor inmediato).`,
            `Con cualquier clave que se encuentre en la raíz del árbol para agilizar el borrado.`,
            `Se puede eliminar directamente del nodo interno sin realizar ningún intercambio.`
        ];

        const correctIndex = 0;

        const feedback = [
            `¡Correcto! Por convención académica (y consistencia con HEA), intercambiamos con el sucesor inmediato en la hoja (el elemento más chico de su subárbol derecho).`,
            `Incorrecto. Si bien es teóricamente válido intercambiar con el predecesor (el mayor del subárbol izquierdo), la convención de nuestra cátedra y del sistema de referencia HEA utiliza siempre el sucesor inmediato (el más chico del derecho).`,
            `Incorrecto. Intercambiar con un elemento cualquiera de la raíz rompería el orden de búsqueda del árbol B.`,
            `Incorrecto. Borrar directamente un elemento de un nodo interno dejaría un puntero huérfano o alteraría los límites divisores de claves.`
        ];

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta simple antes de remover la clave de la hoja.
     */
    static makeBeforeLeafDeleteQuestion(event) {
        const { nodeId, nodeKeys, keyToDelete, deleteIdx } = event;
        
        const questionText = `Procederemos a eliminar la clave ${keyToDelete} del nodo hoja ${nodeId} con claves [${nodeKeys.join(', ')}]. ¿Qué índice temporal (0-indexed) ocupa la clave que va a ser removida?`;

        const options = [
            `Ocupa el índice ${deleteIdx}.`, // Correcta
            `Ocupa el índice ${deleteIdx === 0 ? 1 : 0}.`,
            `El índice no es relevante ya que se borra del final del nodo.`,
            `Siempre se elimina la clave en el índice central del nodo.`
        ];

        const correctIndex = 0;

        const feedback = [
            `¡Correcto! La clave ${keyToDelete} se encuentra en la posición física de índice ${deleteIdx}.`,
            `Incorrecto. Podés verificar contando la posición de la clave ${keyToDelete} (empezando desde 0) dentro del nodo.`,
            `Incorrecto. Las claves están ordenadas y debemos eliminar la posición exacta para no corromper el arreglo.`,
            `Incorrecto. Se elimina la clave buscada, no la del medio.`
        ];

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta crítica sobre la detección del underflow.
     */
    static makeUnderflowDetectedQuestion(event) {
        const { nodeId, nodeKeys, minKeys } = event;
        
        const questionText = `El nodo ${nodeId} quedó con claves [${nodeKeys.join(', ')}] (cantidad: ${nodeKeys.length}). Si el mínimo de claves requerido para este orden es ${minKeys}, ¿qué situación se ha presentado?`;

        const options = [
            `Se ha producido un Underflow. El nodo tiene menos elementos del mínimo permitido y debe balancearse.`, // Correcta
            `Se ha producido un Overflow. El nodo excede la capacidad mínima y debe dividirse.`,
            `El nodo se encuentra en estado normal porque es un nodo hoja y no tiene restricciones.`,
            `Se debe eliminar el nodo entero para resolver el problema inmediatamente.`
        ];

        const correctIndex = 0;

        const feedback = [
            `¡Correcto! Al quedar con ${nodeKeys.length} claves (menor que el mínimo ${minKeys}), el nodo entra en bajo flujo (underflow) y requiere redistribución o fusión.`,
            `Incorrecto. El overflow ocurre por exceso de claves (mayor a M-1), no por defecto.`,
            `Incorrecto. Todos los nodos (hojas e internos, excepto la raíz) están sujetos a la restricción de ocupación mínima de claves.`,
            `Incorrecto. Eliminar el nodo de forma directa rompería la estructura balanceada del árbol; se deben aplicar políticas lógicas.`
        ];

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta sobre redistribución.
     */
    static makeRedistributeQuestion(event) {
        const { nodeId, parentId, siblingId, type } = event;
        const direction = type === 'REDISTRIBUTE_LEFT' ? 'izquierdo' : 'derecho';
        
        const questionText = `Para solucionar el underflow del nodo ${nodeId}, su hermano ${direction} (${siblingId}) puede prestarle una clave porque supera el mínimo. ¿Cómo fluyen las claves en esta redistribución?`;

        const options = [
            `La clave del padre baja al nodo en underflow, y la clave extrema del hermano sube al padre como nuevo divisor.`, // Correcta
            `La clave del hermano pasa directamente al nodo en underflow, dejando al padre intacto.`,
            `Se mezclan todas las claves del hermano y el nodo, y se dividen en partes iguales eliminando el padre.`,
            `La clave del padre baja al hermano, y la clave del nodo sube directamente al padre.`
        ];

        const correctIndex = 0;

        const feedback = [
            `¡Correcto! En una redistribución (rotación), la clave del padre actúa como pivote bajando al nodo en underflow, y es reemplazada en el padre por la clave extrema del hermano para mantener las propiedades de orden.`,
            `Incorrecto. Pasar una clave directamente del hermano al nodo sin involucrar al padre violaría la propiedad de búsqueda del árbol B (la clave del padre ya no separaría correctamente los límites).`,
            `Incorrecto. La redistribución no elimina claves del padre ni fusiona los nodos; mantiene el número de nodos intacto.`,
            `Incorrecto. Si la clave del padre baja al hermano y la del nodo sube, se empeoraría el underflow en el nodo original.`
        ];

        return { questionText, options, correctIndex, feedback };
    }

    /**
     * Pregunta sobre fusión.
     */
    static makeMergeQuestion(event) {
        const { nodeId, parentId, siblingId, type } = event;
        const direction = type === 'MERGE_LEFT' ? 'izquierdo' : 'derecho';
        
        const questionText = `Los hermanos adyacentes no tienen claves suficientes para prestar (están en su mínimo). Corresponde una fusión con el hermano ${direction} (${siblingId}). ¿Cómo se realiza esta fusión?`;

        const options = [
            `La clave del padre (que actúa de separador) baja y se concatena junto con las claves de ambos nodos en un solo nodo. El nodo en underflow se destruye.`, // Correcta
            `Los nodos se fusionan directamente y el padre mantiene su clave separadora sin cambios.`,
            `La clave del nodo en underflow sube al padre, y el hermano absorbe al padre directamente.`,
            `Se crea un nodo vacío para unir a ambos hermanos, aumentando la altura del árbol.`
        ];

        const correctIndex = 0;

        const feedback = [
            `¡Correcto! En una fusión, la clave separadora del padre baja y se une a las claves del hermano y del nodo con underflow. Al agruparlas en un solo nodo, el padre pierde una clave y el nodo vacío se elimina.`,
            `Incorrecto. Si no bajara la clave del padre, esta quedaría huérfana en el padre apuntando a un único hijo fusionado, lo cual es inválido.`,
            `Incorrecto. Subir una clave al padre cuando hay bajo flujo agravaría aún más el problema de subocupación en el árbol.`,
            `Incorrecto. Crear un nodo vacío no soluciona el bajo flujo de claves; la fusión reduce el número de nodos en 1.`
        ];

        return { questionText, options, correctIndex, feedback };
    }
}

