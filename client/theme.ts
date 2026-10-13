import { colors, createTheme } from '@mui/material';

export default createTheme({
  // Breakpoints fit work monitors: md — two windows side by side on 1920x1080,
  // lg — laptops and small monitors.
  breakpoints: {
    values: { xs: 0, sm: 600, md: 1150, lg: 1600, xl: 1920 },
  },
  typography: {
    h1: { fontWeight: 400, fontSize: '1.5rem', letterSpacing: 0, lineHeight: '1.4' },
    h2: { fontWeight: 400, fontSize: '1.2rem', letterSpacing: 0, lineHeight: '1.4' },
    h3: { fontWeight: 400, fontSize: '1rem', letterSpacing: 0, lineHeight: '1.4' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': { height: '100%' },
        body: { backgroundColor: colors.grey[100] },
      },
    },
    MuiPaper: { defaultProps: { elevation: 2 } },
    MuiSnackbar: {
      defaultProps: {
        autoHideDuration: 10e3,
        anchorOrigin: { vertical: 'top', horizontal: 'right' },
      },
    },
    MuiAlert: { defaultProps: { elevation: 6, variant: 'filled' } },
    MuiTextField: { defaultProps: { variant: 'standard', size: 'small' } },
    MuiTable: { defaultProps: { stickyHeader: true } },
    MuiTableCell: { styleOverrides: { root: { padding: '4px 6px' } } },
    MuiTabs: { defaultProps: { textColor: 'inherit' } },
  },
});
