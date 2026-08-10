// Estilos base das páginas. Mantidos fora de ui.jsx para que aquele arquivo
// exporte apenas componentes (requisito do Fast Refresh).

import { StyleSheet } from '@react-pdf/renderer';
import { COLORS, PAGE, FONT } from './theme';

export const styles = StyleSheet.create({
  page: {
    fontFamily: FONT,
    backgroundColor: COLORS.page,
    color: COLORS.text,
    paddingTop: PAGE.marginTop,
    paddingBottom: PAGE.marginBottom,
    paddingHorizontal: PAGE.marginX,
    fontSize: 9,
  },
  coverPage: {
    fontFamily: FONT,
    backgroundColor: COLORS.ink,
    color: COLORS.onInk,
    padding: 0,
  },
});
