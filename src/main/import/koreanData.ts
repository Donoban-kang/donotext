// Korean language data used to READ documents (numbering styles, particles, style names).
// This is not UI text: nothing here is shown to the user, so it lives outside the ko.ts translation
// table. scripts/i18nScan.mjs allows this one file for that reason.

/** Words after a page number: "3쪽", "3페이지". */
export const PAGE_NUMBER_UNITS = '쪽|페이지'

/** Bullet symbols used in Korean official documents (plus common typographic bullets). */
export const BULLET_CHARS = '○●◦◎ㅇ·•▪▫■□◆◇▶▷►‣⁃'

/** Hangul label syllables in outline numbering: 가. 나. 다. ... 하. */
export const LABEL_SYLLABLES = '가-하'

/** Circled numbers and circled Hangul: ① ② ... ㉠ ㉡ ... */
export const CIRCLED_LABELS = '①-⑳㉠-㉭㈀-㈍'

/** Particles: they end a Korean word far more often than a random syllable does (roughly 40% vs 13%). */
export const PARTICLES = new Set('을를은는이가에의로와과도'.split(''))

/** Font-name fragment meaning "bold" in Korean font names. */
export const BOLD_FONT_WORD = '굵'

/** Word style names: "제목" (Title) and "제목 1".."제목 6" (Heading), plus outline levels "개요 1".. */
export const TITLE_STYLE = '제목'
export const HEADING_STYLE = '제목'
export const OUTLINE_STYLE = '개요'
