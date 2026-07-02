const assert = require('assert');
const {
    BTreeEngine,
    BPlusTreeEngine,
    BStarTreeEngine
} = require('../js/engine.js');

// Helper to run a generator to completion and return the final result
function run(generator) {
    let res = generator.next();
    while (!res.done) {
        res = generator.next(res.value);
    }
    return res.value;
}

// Helper to compare tree structure
function getStructure(node) {
    if (!node) return null;
    return {
        keys: node.keys,
        children: node.children.map(getStructure)
    };
}

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

// ==========================================
// TEST CASES: B-TREE M=4
// ==========================================
test('B-Tree M=4 Inserciones y Bajas con Overflow/Underflow Cascadas', () => {
    const engine = new BTreeEngine(4);
    let root = null;

    // 1. Inserciones secuenciales (con overflow simple y en cascada)
    const insertKeys = [40, 25, 96, 67, 88, 105, 75, 91, 80, 86, 120, 230, 95, 55, 70];
    
    let totalReads = 0;
    let totalWrites = 0;
    
    for (const key of insertKeys) {
        const res = run(engine.insertGenerator(root, key));
        assert.ok(res.success, `Debería insertar ${key}`);
        root = res.root;
        totalReads += res.reads;
        totalWrites += res.writes;
    }

    // Estructura final esperada tras insertar todas las claves:
    // Raíz: [88]
    // Hijos internos: [67, 80] y [96]
    // Hojas: [25, 40, 55], [70, 75], [86], [91, 95], [105, 120, 230]
    const struct = getStructure(root);
    assert.deepStrictEqual(struct, {
        keys: [88],
        children: [
            {
                keys: [67, 80],
                children: [
                    { keys: [25, 40, 55], children: [] },
                    { keys: [70, 75], children: [] },
                    { keys: [86], children: [] }
                ]
            },
            {
                keys: [96],
                children: [
                    { keys: [91, 95], children: [] },
                    { keys: [105, 120, 230], children: [] }
                ]
            }
        ]
    }, 'Estructura incorrecta tras inserciones');

    // 2. Eliminación: Baja simple sin underflow (75)
    let res = run(engine.deleteGenerator(root, 75, 'derOIzq'));
    assert.ok(res.success);
    root = res.root;
    assert.deepStrictEqual(getStructure(root).children[0].children[1].keys, [70]);

    // 3. Eliminación: Baja de nodo interno reemplazado por sucesor en hoja (88)
    // El sucesor es 91. 91 sube a la raíz. La hoja de donde sale 91 queda [95], no hay underflow.
    res = run(engine.deleteGenerator(root, 88, 'derOIzq'));
    assert.ok(res.success);
    root = res.root;
    assert.deepStrictEqual(root.keys, [91]);
    assert.deepStrictEqual(getStructure(root).children[1].children[0].keys, [95]);

    // 4. Eliminación: Underflow resuelto con redistribución desde hermano izquierdo (70)
    // Hoja queda vacía. Hermano izquierdo [25, 40, 55] cede 55. Padre 67 baja.
    // Hoja queda [67], hermano izquierdo queda [25, 40], separador en padre pasa a ser 55.
    res = run(engine.deleteGenerator(root, 70, 'derOIzq'));
    assert.ok(res.success);
    root = res.root;
    const leftInternal = getStructure(root).children[0];
    assert.deepStrictEqual(leftInternal.keys, [55, 80]);
    assert.deepStrictEqual(leftInternal.children[0].keys, [25, 40]);
    assert.deepStrictEqual(leftInternal.children[1].keys, [67]);

    // 5. Eliminación: Baja simple (105) en hoja [105, 120, 230] -> [120, 230]
    res = run(engine.deleteGenerator(root, 105, 'derOIzq'));
    assert.ok(res.success);
    root = res.root;
    assert.deepStrictEqual(getStructure(root).children[1].children[1].keys, [120, 230]);

    // 6. Eliminación: Underflow resuelto con fusión con hermano izquierdo (86)
    // Hoja de 86 queda vacía. Hermano derecho no existe. Hermano izquierdo [67] está en el mínimo.
    // Fusión con hermano izquierdo [67] y separador del padre 80. Hoja queda [67, 80].
    // Padre pierde 80, queda [55].
    res = run(engine.deleteGenerator(root, 86, 'derOIzq'));
    assert.ok(res.success);
    root = res.root;
    const leftInternalAfterMerge = getStructure(root).children[0];
    assert.deepStrictEqual(leftInternalAfterMerge.keys, [55]);
    assert.deepStrictEqual(leftInternalAfterMerge.children.length, 2);
    assert.deepStrictEqual(leftInternalAfterMerge.children[1].keys, [67, 80]);

    // 7. Eliminación: Baja simple (230) en hoja [120, 230] -> [120]
    res = run(engine.deleteGenerator(root, 230, 'derOIzq'));
    assert.ok(res.success);
    root = res.root;
    assert.deepStrictEqual(getStructure(root).children[1].children[1].keys, [120]);

    // 8. Eliminación: Baja que produce fusión y propagación en cascada hasta achicar altura (95)
    // Hoja de 95 queda vacía. Fusión con hermano [120] y separador 96. Hoja queda [96, 120].
    // Nodo padre (era [96]) queda vacío -> underflow.
    // Padre no tiene hermano que ceda (hermano es [55] que está al mínimo).
    // Fusión de nodos internos a través de la raíz (91). Nueva raíz fusionada: [55, 91].
    res = run(engine.deleteGenerator(root, 95, 'derOIzq'));
    assert.ok(res.success);
    root = res.root;
    
    assert.deepStrictEqual(getStructure(root), {
        keys: [55, 91],
        children: [
            { keys: [25, 40], children: [] },
            { keys: [67, 80], children: [] },
            { keys: [96, 120], children: [] }
        ]
    });
});

// ==========================================
// TEST CASES: B-TREE M=5 (Odd M)
// ==========================================
test('B-Tree M=5 Inserciones y Bajas (Diferentes Políticas)', () => {
    const engine = new BTreeEngine(5); // maxKeys = 4, minKeys = 1
    let root = null;

    // Inserciones para provocar overflow simple
    // [10, 20, 30, 40]
    for (const key of [10, 20, 30, 40]) {
        root = run(engine.insertGenerator(root, key)).root;
    }
    assert.deepStrictEqual(root.keys, [10, 20, 30, 40]);

    // Insertar 50 provoca overflow. Menor de las mayores (o del medio): 30 promociona.
    root = run(engine.insertGenerator(root, 50)).root;
    assert.deepStrictEqual(getStructure(root), {
        keys: [30],
        children: [
            { keys: [10, 20], children: [] },
            { keys: [40, 50], children: [] }
        ]
    });

    // Añadimos más claves para probar políticas
    for (const key of [60, 70]) {
        root = run(engine.insertGenerator(root, key)).root;
    }
    // Estructura actual:
    // Raíz: [30]
    // Hijos: [10, 20], [40, 50, 60, 70]

    // Probemos eliminar 10 con política 'derecha'
    // El nodo [10, 20] queda [20] (tiene mínimo, no hay underflow)
    root = run(engine.deleteGenerator(root, 10, 'derecha')).root;
    assert.deepStrictEqual(getStructure(root).children[0].keys, [20]);

    // Eliminar 20 provoca underflow en el nodo izquierdo.
    // Hermano derecho [40, 50, 60, 70] puede ceder.
    // Con política 'derecha', se redistribuye a derecha:
    // Clave 30 del padre baja, 40 sube al padre.
    root = run(engine.deleteGenerator(root, 20, 'derecha')).root;
    assert.deepStrictEqual(getStructure(root), {
        keys: [40],
        children: [
            { keys: [30], children: [] },
            { keys: [50, 60, 70], children: [] }
        ]
    });
});

// ==========================================
// TEST CASES: B+ TREE M=4
// ==========================================
test('B+ Tree M=4 Inserciones, Duplicados en Nodos Internos y Bajas', () => {
    const engine = new BPlusTreeEngine(4);
    let root = null;

    // 1. Inserciones secuenciales según el ejemplo de teoría
    const insertKeys = [50, 75, 23, 8, 121, 15, 2, 13, 88, 90, 100];
    for (const key of insertKeys) {
        root = run(engine.insertGenerator(root, key)).root;
    }

    // Estructura esperada de B+ Tree:
    // Raíz: [88]
    // Internos: [15, 50] (izq), [100] (der)
    // Hojas: [2, 8, 13], [15, 23], [50, 75], [88, 90], [100, 121]
    assert.deepStrictEqual(getStructure(root), {
        keys: [88],
        children: [
            {
                keys: [15, 50],
                children: [
                    { keys: [2, 8, 13], children: [] },
                    { keys: [15, 23], children: [] },
                    { keys: [50, 75], children: [] }
                ]
            },
            {
                keys: [100],
                children: [
                    { keys: [88, 90], children: [] },
                    { keys: [100, 121], children: [] }
                ]
            }
        ]
    });

    // 2. Eliminación en B+: Baja de clave 100 (existe en hoja e índice)
    // En B+, se quita de la hoja [100, 121] -> [121]. La clave en el índice NO se modifica.
    root = run(engine.deleteGenerator(root, 100, 'izquierdaODer')).root;
    assert.deepStrictEqual(getStructure(root).children[1].keys, [100]); // El índice sigue teniendo 100
    assert.deepStrictEqual(getStructure(root).children[1].children[1].keys, [121]); // La hoja ya no tiene 100

    // 3. Eliminación: Baja de clave 121 provoca underflow en hoja
    // Hermano izquierdo [88, 90] tiene margen y presta. 90 pasa a la hoja derecha.
    // El señalador del índice se actualiza de 100 a 90.
    root = run(engine.deleteGenerator(root, 121, 'izquierdaODer')).root;
    assert.deepStrictEqual(getStructure(root).children[1].keys, [90]); // Señalador actualizado
    assert.deepStrictEqual(getStructure(root).children[1].children[0].keys, [88]);
    assert.deepStrictEqual(getStructure(root).children[1].children[1].keys, [90]);
});

// ==========================================
// TEST CASES: B* TREE M=4
// ==========================================
test('B* Tree M=4 Inserción con Redistribución y Fisión 3-a-2', () => {
    const engine = new BStarTreeEngine(4); // minKeys = 2 (2/3 de M=4) para B*
    let root = null;

    // Insertar claves
    const keys = [10, 20, 30];
    for (const k of keys) {
        root = run(engine.insertGenerator(root, k)).root;
    }
    assert.deepStrictEqual(root.keys, [10, 20, 30]);

    // Insertar 40 provocaría overflow.
    // En B*, en lugar de dividir inmediatamente, intentará redistribuir con un hermano.
    // Pero como no tiene hermanos todavía, se divide en la raíz.
    // La raíz se divide 1-en-2.
    root = run(engine.insertGenerator(root, 40)).root;
    assert.deepStrictEqual(getStructure(root), {
        keys: [30],
        children: [
            { keys: [10, 20], children: [] },
            { keys: [40], children: [] }
        ]
    });

    // Insertamos 15. Debería entrar en el hijo izquierdo, quedando [10, 15, 20]
    root = run(engine.insertGenerator(root, 15)).root;
    assert.deepStrictEqual(getStructure(root), {
        keys: [30],
        children: [
            { keys: [10, 15, 20], children: [] },
            { keys: [40], children: [] }
        ]
    });

    // Insertamos 12. Hijo izquierdo desborda a [10, 12, 15, 20].
    // Redistribuye a la derecha con [40] usando el separador 30.
    // Hermano derecho queda [30, 40], izquierdo queda [10, 12, 15], separador sube 20.
    root = run(engine.insertGenerator(root, 12)).root;
    assert.deepStrictEqual(getStructure(root), {
        keys: [20],
        children: [
            { keys: [10, 12, 15], children: [] },
            { keys: [30, 40], children: [] }
        ]
    });

    // Insertamos 5. Hijo izquierdo desborda a [5, 10, 12, 15].
    // Redistribuye a la derecha con [30, 40] usando el separador 20.
    // Hermano derecho queda [20, 30, 40], izquierdo queda [5, 10, 12], separador sube 15.
    root = run(engine.insertGenerator(root, 5)).root;
    assert.deepStrictEqual(getStructure(root), {
        keys: [15],
        children: [
            { keys: [5, 10, 12], children: [] },
            { keys: [20, 30, 40], children: [] }
        ]
    });
});

// Run all tests
let passed = 0;
let failed = 0;

console.log('Ejecutando tests unitarios del motor...\n');

for (const t of tests) {
    try {
        t.fn();
        console.log(`\x1b[32m✔ PASSED\x1b[0m: ${t.name}`);
        passed++;
    } catch (err) {
        console.log(`\x1b[31m✘ FAILED\x1b[0m: ${t.name}`);
        console.error(err);
        failed++;
    }
}

console.log(`\nResultado: ${passed} pasados, ${failed} fallados.`);
process.exit(failed > 0 ? 1 : 0);
