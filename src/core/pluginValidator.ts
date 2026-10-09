import { parse } from 'acorn';
import type {
    AnonymousClassDeclaration,
    ClassDeclaration,
    Expression,
    Identifier,
    Literal,
    MethodDefinition,
    PrivateIdentifier,
    Program
} from 'acorn';
import { readFile } from 'node:fs/promises';

export interface PluginManifest {
    id: string;
    entry: string;
    capabilities: string[];
}

export interface ValidationResult {
    valid: boolean;
    pluginId?: string;
    errors: string[];
    staticId: string;
}

type AnyClassDeclaration = ClassDeclaration | AnonymousClassDeclaration;

function getLiteralString(node: Expression): string | null {
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }
    return null;
}

function isPureExpression(expression: Expression): boolean {
    switch (expression.type) {
        case 'Literal':
            return true;
        case 'Identifier':
            return expression.name === 'undefined';
        case 'TemplateLiteral':
            return expression.expressions.length === 0;
        case 'ArrayExpression':
            return expression.elements.every((element) => {
                if (element === null) {
                    return true;
                }
                if (element.type === 'SpreadElement') {
                    return false;
                }
                return isPureExpression(element);
            });
        case 'ObjectExpression':
            return expression.properties.every((property) => {
                if (property.type !== 'Property' || property.computed || property.kind !== 'init') {
                    return false;
                }
                const value = property.value;
                const valueType = value.type as string;
                if (valueType === 'ObjectPattern' || valueType === 'ArrayPattern' || valueType === 'RestElement' || valueType === 'AssignmentPattern') {
                    return false;
                }
                return isPureExpression(value);
            });
        default:
            return false;
    }
}

function hasTopLevelSideEffects(program: Program): boolean {
    for (const statement of program.body) {
        switch (statement.type) {
            case 'ImportDeclaration':
            case 'ExportAllDeclaration':
            case 'ExportDefaultDeclaration':
            case 'ClassDeclaration':
            case 'FunctionDeclaration':
            case 'EmptyStatement':
                break;
            case 'ExportNamedDeclaration':
                if (statement.declaration !== undefined && statement.declaration !== null && statement.declaration.type === 'VariableDeclaration') {
                    for (const declarator of statement.declaration.declarations) {
                        if (declarator.init !== undefined && declarator.init !== null && !isPureExpression(declarator.init)) {
                            return true;
                        }
                    }
                }
                break;
            case 'ExpressionStatement':
                if (getLiteralString(statement.expression) === null) {
                    return true;
                }
                break;
            case 'VariableDeclaration':
                for (const declarator of statement.declarations) {
                    if (declarator.init !== undefined && declarator.init !== null && !isPureExpression(declarator.init)) {
                        return true;
                    }
                }
                break;
            default:
                return true;
        }
    }
    return false;
}

function isIdKey(key: Expression | PrivateIdentifier): boolean {
    if (key.type === 'Identifier') {
        return key.name === 'id';
    }
    if (key.type === 'Literal') {
        return key.value === 'id';
    }
    return false;
}

function getGetterString(member: MethodDefinition): string | null {
    if (member.kind !== 'get') {
        return null;
    }
    const statements = member.value.body.body;
    if (statements.length !== 1) {
        return null;
    }
    const only = statements[0];
    if (only === undefined || only.type !== 'ReturnStatement') {
        return null;
    }
    if (only.argument === null || only.argument === undefined) {
        return null;
    }
    return getLiteralString(only.argument);
}

function getStaticId(declaration: AnyClassDeclaration): string | null {
    for (const member of declaration.body.body) {
        if (member.type === 'StaticBlock' || member.computed || !member.static) {
            continue;
        }
        if (!isIdKey(member.key)) {
            continue;
        }
        if (member.type === 'PropertyDefinition') {
            if (member.value !== undefined && member.value !== null) {
                const text = getLiteralString(member.value);
                if (text !== null) {
                    return text;
                }
            }
        }
        if (member.type === 'MethodDefinition') {
            const text = getGetterString(member);
            if (text !== null) {
                return text;
            }
        }
    }
    return null;
}

function findTopLevelClass(program: Program, name: string): AnyClassDeclaration | null {
    for (const statement of program.body) {
        if (statement.type === 'ClassDeclaration' && statement.id !== null && statement.id.name === name) {
            return statement;
        }
    }
    return null;
}

function readExportedName(node: Identifier | Literal): string | null {
    if (node.type === 'Identifier') {
        return node.name;
    }
    if (typeof node.value === 'string') {
        return node.value;
    }
    return null;
}

interface DefaultExportAnalysis {
    classes: AnyClassDeclaration[];
    nonClassDefaults: number;
}

function analyzeDefaultExports(program: Program): DefaultExportAnalysis {
    const classes: AnyClassDeclaration[] = [];
    let nonClassDefaults = 0;
    for (const statement of program.body) {
        if (statement.type === 'ExportDefaultDeclaration') {
            const target = statement.declaration;
            if (target.type === 'ClassDeclaration') {
                classes.push(target);
            } else if (target.type === 'Identifier') {
                const resolved = findTopLevelClass(program, target.name);
                if (resolved !== null) {
                    classes.push(resolved);
                } else {
                    nonClassDefaults += 1;
                }
            } else {
                nonClassDefaults += 1;
            }
            continue;
        }
        if (statement.type === 'ExportNamedDeclaration') {
            for (const specifier of statement.specifiers) {
                if (specifier.type === 'ExportSpecifier' && readExportedName(specifier.exported) === 'default') {
                    const local = readExportedName(specifier.local);
                    const resolved = local === null ? null : findTopLevelClass(program, local);
                    if (resolved !== null) {
                        classes.push(resolved);
                    } else {
                        nonClassDefaults += 1;
                    }
                }
            }
        }
    }
    return { classes, nonClassDefaults };
}

function missingClassMessage(): string {
    return 'Plugin must have exactly one default export of a class with a static string `id` property';
}

export async function validatePluginEntry(entryPath: string, manifest: PluginManifest): Promise<ValidationResult> {
    const errors: string[] = [];
    let staticId = '';
    try {
        const sourceText = await readFile(entryPath, 'utf8');
        let program: Program;
        try {
            program = parse(sourceText, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
        } catch (err) {
            errors.push(`Plugin entry has syntax errors: ${err instanceof Error ? err.message : String(err)}`);
            return { valid: false, errors, staticId: '' };
        }
        if (hasTopLevelSideEffects(program)) {
            errors.push('Plugin entry contains top-level side effects (only declarations/imports allowed)');
        }
        const analysis = analyzeDefaultExports(program);
        const totalDefaults = analysis.classes.length + analysis.nonClassDefaults;
        if (totalDefaults === 0) {
            errors.push(missingClassMessage());
        } else if (totalDefaults > 1 || analysis.nonClassDefaults > 0) {
            errors.push('Plugin entry must contain exactly one default export of a class (multiple or non-class default exports found)');
        } else {
            const candidate = analysis.classes[0];
            if (candidate === undefined) {
                errors.push(missingClassMessage());
            } else {
                const extracted = getStaticId(candidate);
                if (extracted === null) {
                    errors.push(missingClassMessage());
                } else {
                    staticId = extracted;
                    if (staticId !== manifest.id) {
                        errors.push(`Plugin id mismatch: static id "${staticId}" does not match manifest id "${manifest.id}"`);
                    }
                }
            }
        }
        return {
            valid: errors.length === 0,
            pluginId: errors.length === 0 ? staticId : undefined,
            errors,
            staticId
        };
    } catch (err) {
        errors.push(`Failed to parse plugin entry: ${err instanceof Error ? err.message : String(err)}`);
        return { valid: false, errors, staticId: '' };
    }
}
