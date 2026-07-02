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

            default:
                // Otros eventos (SEARCH_NODE, SEARCH_FOUND, SEARCH_NOT_FOUND, NEW_ROOT, PROPAGATE_PARENT, INSERT_COMPLETED)
                // se muestran como información y animaciones en la UI sin bloquear con pregunta,
                // o se pueden integrar preguntas adicionales en etapas avanzadas.
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
}
