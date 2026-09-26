import { MessageStructureObject } from 'imapflow';

export interface GmailAttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface GmailBodyParts {
  plain: string[];
  html: string[];
  attachments: GmailAttachmentMeta[];
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return HTML_ENTITIES[entity.toLowerCase()] ?? match;
    const hexadecimal = entity[1]?.toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : match;
  });
}

export function extractTextFromHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(style|script|head|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<img\b[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(address|article|blockquote|div|h[1-6]|li|p|pre|section|table|tr)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/<[^>]*$/g, ' ')
      .replace(/\[image:[^\]]*]/gi, ' '),
  )
    .replace(/[\u00ad\u034f\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/ *\r?\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function emailTextPreview(value: string): string {
  return extractTextFromHtml(value)
    .replace(/@font-face\s*\{[^{}]*}/gi, ' ')
    .replace(/\[https?:\/\/[^\]]+]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function inspectBodyStructure(root?: MessageStructureObject): GmailBodyParts {
  const result: GmailBodyParts = { plain: [], html: [], attachments: [] };
  if (!root) return result;

  const visit = (node: MessageStructureObject): void => {
    const filename = node.dispositionParameters?.filename || node.parameters?.name;
    const isAttachment = node.disposition?.toLowerCase() === 'attachment' || Boolean(filename);

    if (isAttachment && node.part) {
      result.attachments.push({
        id: node.part,
        filename: filename || `attachment-${node.part}`,
        contentType: node.type || 'application/octet-stream',
        size: node.size ?? 0,
      });
      return;
    }

    if (node.part && node.type.toLowerCase() === 'text/plain') result.plain.push(node.part);
    if (node.part && node.type.toLowerCase() === 'text/html') result.html.push(node.part);
    node.childNodes?.forEach(visit);
  };

  visit(root);
  return result;
}
