export const ko = {
  appName: 'donotext',
  open: '열기',
  newDoc: '새 문서',
  save: '저장',
  saveAs: '다른 이름으로 저장',
  sourceMode: '소스 모드',
  wysiwygMode: 'WYSIWYG 모드',
  emptyPane: '파일을 열거나 새 문서를 만들어 시작하세요.',
  closeTab: '탭 닫기',
  dirtyMark: '수정됨',
  discard: '저장 안 함',
  cancel: '취소',
  confirmUnsavedTitle: '"{name}"의 변경 내용을 저장할까요?',
  confirmUnsavedBody: '저장하지 않으면 변경 내용이 사라집니다.',
  saveFailed: '"{name}"을(를) 저장하지 못했습니다: {reason}',
  warnTooLarge: '파일이 5MB를 넘어 소스 모드로만 열었습니다.',
  warnNotUtf8: 'UTF-8이 아닌 파일이라 읽기 전용으로 열었습니다. 다른 이름으로 저장하면 UTF-8로 저장됩니다.',
  openFailed: '파일을 열지 못했습니다: {reason}',
  compareUnavailable: '비교 탭'
} as const

export type MessageKey = keyof typeof ko
