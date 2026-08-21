export function scrollOffsetForVisibleInput({
  currentOffset,
  inputTop,
  inputBottom,
  viewportTop,
  viewportBottom,
  extraOffset = 18,
}: {
  currentOffset: number;
  inputTop: number;
  inputBottom: number;
  viewportTop: number;
  viewportBottom: number;
  extraOffset?: number;
}): number {
  const topOverlap = viewportTop + 8 - inputTop;
  if (topOverlap > 0) return Math.max(0, currentOffset - topOverlap);

  const bottomOverlap = inputBottom + extraOffset - viewportBottom;
  return bottomOverlap > 0 ? Math.max(0, currentOffset + bottomOverlap) : currentOffset;
}

export function visibleViewportBottom(viewportBottom: number, keyboardTop?: number): number {
  return typeof keyboardTop === 'number' && keyboardTop > 0
    ? Math.min(viewportBottom, keyboardTop)
    : viewportBottom;
}
