/**
 * Scaffold Hover의 VSCode 배선 (§7 B2) — `useApi`·`$router`·`$ui`·`$util`·UI 컴포넌트 위에 마우스를 올리면
 * 그 자리에 계약/부품 카드를 띄운다.
 *
 * 판정과 문안은 전부 순수 모듈(`ai/hover/ScaffoldHover`)이 만든다. 여기는 **언제 띄울지**와
 * **자료를 어디서 읽어올지**만 맡는다 — 린트(C1) provider와 같은 층 분리다.
 *
 * ## 설계 결정
 * - **읽기 전용·모델 호출 0**: 코드를 건드리지 않고, 폐쇄망·서버 미기동에서도 그대로 돈다.
 * - **스캐폴드 워크스페이스에서만**(린트와 같은 판정을 공유): scaffold가 아닌 프로젝트에서 이 계약을
 *   띄우면 전부 오답이고, 계약을 **구현하는** 영역(`src/core`·shadcn 원본)에서도 침묵한다.
 * - **양보**: 해당 심볼이 아니면 null을 돌려준다 → TypeScript hover가 평소대로 뜬다. 우리 카드는
 *   TS hover 아래에 **덧붙는다**(빼앗지 않는다).
 * - **카탈로그는 게을리 한 번만** 읽는다(문서 39장 파싱). 설정이 바뀌면 버린다.
 */

import * as vscode from 'vscode';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { renderHoverMarkdown, resolveScaffoldHover } from '../ai/hover/ScaffoldHover';
import type { ICatalogEntry } from '../ai/catalog/ComponentCatalog';
import { hasGuideDoc, loadComponentCatalog } from './CatalogSource';
import { SCAFFOLD_LANGS, isScaffoldSourceDocument } from './scaffoldWorkspace';

export class ScaffoldHoverProvider implements vscode.HoverProvider {
  /** 카탈로그 조립 결과 캐시(문서 39장 파싱이라 hover 때마다 다시 읽지 않는다). */
  private _entries: ICatalogEntry[] | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        SCAFFOLD_LANGS.map((language) => ({ language, scheme: 'file' })),
        this,
      ),
      vscode.workspace.onDidChangeConfiguration((e) => {
        // 가이드·지식 문서의 출처가 바뀌면 카탈로그를 다시 읽는다.
        if (e.affectsConfiguration('axiom-ai.sdd.axiomFolder')) this._entries = null;
      }),
    );
  }

  provideHover(doc: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    if (!ExtensionConfig.isHoverEnabled()) return null;
    if (!isScaffoldSourceDocument(doc)) return null;

    let card;
    try {
      card = resolveScaffoldHover({
        lineText: doc.lineAt(position.line).text,
        character: position.character,
        source: doc.getText(),
        entries: this._catalog(),
      });
    } catch {
      // hover가 문서 하나 때문에 죽지 않게 — 판정 실패는 "hover 없음"으로 처리(fail-open).
      return null;
    }
    if (!card) return null;

    const md = new vscode.MarkdownString(
      renderHoverMarkdown(card, { hasGuideDoc: (docId) => hasGuideDoc(this._extensionUri, docId) }),
    );
    // 카드 아래 링크가 `command:` URI라 신뢰 표시가 필요하다(내용은 우리가 만든 문자열뿐이다).
    md.isTrusted = true;
    md.supportHtml = false;

    const range = new vscode.Range(
      new vscode.Position(position.line, card.range.start),
      new vscode.Position(position.line, card.range.end),
    );
    return new vscode.Hover(md, range);
  }

  private _catalog(): ICatalogEntry[] {
    if (!this._entries) {
      try {
        this._entries = loadComponentCatalog(this._extensionUri).entries;
      } catch {
        this._entries = []; // 자료를 못 읽어도 계약 hover는 계속 떠야 한다
      }
    }
    return this._entries;
  }
}
