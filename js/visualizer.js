/**
 * visualizer.js
 * Módulo encargado de renderizar de manera interactiva el Árbol B en formato SVG.
 * 
 * Implementa auto-escala del ViewBox, centrado de subárboles y
 * soporte de animaciones/resaltado de nodos en foco o claves comparadas.
 */

class TreeVisualizer {
    constructor(cellWidth = 35, cellHeight = 30, levelHeight = 100) {
        this.cellWidth = cellWidth;
        this.cellHeight = cellHeight;
        this.levelHeight = levelHeight;
    }

    /**
     * Dibuja el árbol en el contenedor SVG especificado.
     * 
     * @param {SVGElement} svgElement - El elemento <svg> del DOM
     * @param {BTreeNode} root - La raíz del árbol
     * @param {object} highlightOptions - Opciones para resaltar elementos
     *   - activeNodeId: ID del nodo actualmente activo/focalizado
     *   - highlightedKeys: Array de claves a resaltar (por ejemplo, clave comparada en búsqueda)
     *   - promoKey: Clave que está siendo promocionada en este paso
     */
    draw(svgElement, root, highlightOptions = {}) {
        // Limpiar contenido previo
        while (svgElement.firstChild) {
            svgElement.removeChild(svgElement.firstChild);
        }

        if (!root || root.keys.length === 0) {
            // Dibujar un mensaje de árbol vacío
            const text = this.createSVGElement('text', {
                x: 0,
                y: 40,
                'text-anchor': 'middle',
                class: 'empty-tree-text'
            });
            text.textContent = 'El árbol está vacío. Insertá un elemento para comenzar.';
            svgElement.appendChild(text);
            svgElement.setAttribute('viewBox', '-200 0 400 100');
            return;
        }

        // 1. Calcular anchos de subárboles (bottom-up)
        this.computeSubtreeWidth(root);

        // 2. Asignar coordenadas a cada nodo (top-down, centrado)
        this.assignCoordinates(root, 0, 40);

        // 3. Recopilar todos los nodos para calcular los límites del ViewBox
        const nodesList = [];
        this.traverseNodes(root, n => nodesList.push(n));

        // Ajustar el ViewBox dinámicamente según el tamaño del árbol
        let minX = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        nodesList.forEach(node => {
            const w = node.subtreeWidth;
            if (node.x - w / 2 < minX) minX = node.x - w / 2;
            if (node.x + w / 2 > maxX) maxX = node.x + w / 2;
            if (node.y > maxY) maxY = node.y;
        });

        // Sumar márgenes
        const paddingX = 60;
        const paddingY = 60;
        const width = maxX - minX + paddingX * 2;
        const height = maxY - 40 + this.cellHeight + paddingY * 2;
        svgElement.setAttribute('viewBox', `${minX - paddingX} 0 ${width} ${height}`);

        // 4. Dibujar punteros/enlaces entre nodos primero (para que queden por debajo de las cajas de nodos)
        this.drawLinks(svgElement, root);

        // 5. Dibujar los nodos
        this.drawNodes(svgElement, root, highlightOptions);
    }

    /**
     * Calcula recursivamente el ancho ocupado por el subárbol de cada nodo.
     */
    computeSubtreeWidth(node) {
        const nodeWidth = node.keys.length * this.cellWidth;
        
        if (node.isLeaf || node.children.length === 0) {
            // Ancho del nodo más un margen a los lados
            node.subtreeWidth = nodeWidth + 30;
            return node.subtreeWidth;
        }

        let childrenWidthSum = 0;
        node.children.forEach(child => {
            childrenWidthSum += this.computeSubtreeWidth(child) + 20; // 20px de espacio entre hermanos
        });
        childrenWidthSum -= 20; // Descontar el último espaciador

        // El ancho de este subárbol es el máximo entre el ancho de sus hijos y su propia caja
        node.subtreeWidth = Math.max(childrenWidthSum, nodeWidth + 50);
        return node.subtreeWidth;
    }

    /**
     * Asigna coordenadas físicas x, y a los nodos de manera balanceada.
     */
    assignCoordinates(node, x, y) {
        node.x = x;
        node.y = y;

        if (node.isLeaf || node.children.length === 0) return;

        // Centrar a los hijos bajo el nodo padre
        let totalChildrenWidth = 0;
        node.children.forEach(child => {
            totalChildrenWidth += child.subtreeWidth + 20;
        });
        totalChildrenWidth -= 20;

        let startX = x - totalChildrenWidth / 2;
        node.children.forEach(child => {
            const childX = startX + child.subtreeWidth / 2;
            this.assignCoordinates(child, childX, y + this.levelHeight);
            startX += child.subtreeWidth + 20;
        });
    }

    /**
     * Recorrido de nodos para recolectar información o aplicar funciones.
     */
    traverseNodes(node, callback) {
        if (!node) return;
        callback(node);
        if (node.children) {
            node.children.forEach(child => this.traverseNodes(child, callback));
        }
    }

    /**
     * Dibuja los enlaces (líneas de punteros) entre nodos padres e hijos.
     */
    drawLinks(svgElement, node) {
        if (node.isLeaf || node.children.length === 0) return;

        const nodeWidth = node.keys.length * this.cellWidth;
        const leftX = node.x - nodeWidth / 2;

        node.children.forEach((child, index) => {
            // El origen de la flecha es el puntero index en el nodo padre
            const startX = leftX + index * this.cellWidth;
            const startY = node.y + this.cellHeight;

            // El destino de la flecha es la parte superior media del nodo hijo
            const childWidth = child.keys.length * this.cellWidth;
            const endX = child.x;
            const endY = child.y;

            // Dibujar la línea de enlace
            const line = this.createSVGElement('line', {
                x1: startX,
                y1: startY,
                x2: endX,
                y2: endY,
                class: 'tree-link'
            });
            svgElement.appendChild(line);

            // Dibujar un pequeño círculo en el origen del puntero
            const pointerOrigin = this.createSVGElement('circle', {
                cx: startX,
                cy: startY,
                r: 3,
                class: 'pointer-origin'
            });
            svgElement.appendChild(pointerOrigin);

            // Llamar recursivamente
            this.drawLinks(svgElement, child);
        });
    }

    /**
     * Dibuja los rectángulos de los nodos y sus claves.
     */
    drawNodes(svgElement, node, highlightOptions) {
        const nodeWidth = node.keys.length * this.cellWidth;
        const leftX = node.x - nodeWidth / 2;

        // Contenedor del grupo del nodo (agiliza aplicar eventos si hiciera falta)
        const group = this.createSVGElement('g', {
            id: `g-${node.id}`,
            class: `node-group ${node.isLeaf ? 'leaf-node' : 'internal-node'}`
        });

        // Si el nodo es el activo, aplicamos una clase de resaltado
        const isActive = node.id === highlightOptions.activeNodeId;
        
        // Rectángulo principal del nodo (caja contenedora de celdas)
        const rectNode = this.createSVGElement('rect', {
            x: leftX,
            y: node.y,
            width: nodeWidth,
            height: this.cellHeight,
            rx: 6,
            class: `node-rect ${isActive ? 'active-node' : ''}`
        });
        group.appendChild(rectNode);

        // Dibujar cada celda de clave y su valor
        node.keys.forEach((key, index) => {
            const cellX = leftX + index * this.cellWidth;
            
            // ¿Esta clave individual está resaltada (e.g. en búsqueda)?
            const isKeyHighlighted = highlightOptions.highlightedKeys && highlightOptions.highlightedKeys.includes(key);
            const isPromoKey = highlightOptions.promoKey === key;

            // Rectángulo de la celda individual
            const cellRect = this.createSVGElement('rect', {
                x: cellX,
                y: node.y,
                width: this.cellWidth,
                height: this.cellHeight,
                class: `cell-rect ${isKeyHighlighted ? 'highlighted-cell' : ''} ${isPromoKey ? 'promo-cell' : ''}`
            });
            group.appendChild(cellRect);

            // Texto de la clave
            const text = this.createSVGElement('text', {
                x: cellX + this.cellWidth / 2,
                y: node.y + this.cellHeight / 2 + 5, // Ajuste vertical
                'text-anchor': 'middle',
                class: `cell-text ${isKeyHighlighted ? 'highlighted-text' : ''} ${isPromoKey ? 'promo-text' : ''}`
            });
            text.textContent = key;
            group.appendChild(text);

            // Dibujar la línea divisoria vertical entre celdas (salvo en el extremo derecho)
            if (index < node.keys.length - 1) {
                const divider = this.createSVGElement('line', {
                    x1: cellX + this.cellWidth,
                    y1: node.y,
                    x2: cellX + this.cellWidth,
                    y2: node.y + this.cellHeight,
                    class: 'cell-divider'
                });
                group.appendChild(divider);
            }
        });

        // Agregar el grupo del nodo al SVG
        svgElement.appendChild(group);

        // Dibujar nodos hijos recursivamente
        if (!node.isLeaf && node.children) {
            node.children.forEach(child => this.drawNodes(svgElement, child, highlightOptions));
        }
    }

    /**
     * Helper para instanciar elementos SVG de manera más legible.
     */
    createSVGElement(tag, attrs = {}) {
        const elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (let key in attrs) {
            elem.setAttribute(key, attrs[key]);
        }
        return elem;
    }
}
