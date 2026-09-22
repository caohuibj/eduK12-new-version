import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from '../../server-version/backend/node_modules/typescript/lib/typescript.js';
import { changedFiles, domainFor } from './content-scope.mjs';

// Existing task content is declaration-only. Executable changes belong in the
// engine/package surface and must take the full route.
export function isDataModule(text) {
  const source = ts.createSourceFile('content.ts', text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) return false;
  const constants = new Set();
  function value(node) {
    if (!node) return false;
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return true;
    if (ts.isIdentifier(node)) return constants.has(node.text);
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return value(node.expression);
    if (ts.isPrefixUnaryExpression(node)) return [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator) && ts.isNumericLiteral(node.operand);
    if (ts.isArrayLiteralExpression(node)) return node.elements.every(element => value(ts.isSpreadElement(element) ? element.expression : element));
    if (ts.isObjectLiteralExpression(node)) return node.properties.every(property =>
      ts.isPropertyAssignment(property) ? !ts.isComputedPropertyName(property.name) && value(property.initializer)
      : ts.isShorthandPropertyAssignment(property) ? constants.has(property.name.text)
      : ts.isSpreadAssignment(property) && value(property.expression));
    return false;
  }
  return source.statements.every(statement => {
    if (ts.isImportDeclaration(statement)) return statement.importClause?.isTypeOnly === true;
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) return false;
    return statement.declarationList.declarations.every(declaration => {
      if (!ts.isIdentifier(declaration.name) || !value(declaration.initializer)) return false;
      constants.add(declaration.name.text);
      return true;
    });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = changedFiles(process.env.CI_BASE_SHA).filter(file => domainFor(file) === 'cognitive' && fs.existsSync(file));
  for (const file of files) {
    if (fs.lstatSync(file).isSymbolicLink() || !isDataModule(fs.readFileSync(file, 'utf8'))) throw new Error(`Not declaration-only Cognitive content: ${file}`);
  }
  console.log(`Cognitive data-only boundary: PASS (${files.length} changed files)`);
}
