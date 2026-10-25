import { ArrowForward, ExpandMore } from '@mui/icons-material';
import { Accordion, AccordionDetails, AccordionSummary, Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { helpEn } from '#shared/i18n/help/en.ts';
import { helpRu, type Help } from '#shared/i18n/help/ru.ts';
import Diagrams from './HelpPage/Diagrams.tsx';

const GUIDES: Record<string, Help> = { ru: helpRu, en: helpEn };

/** A topic of the use cases or the answers: its title over its folds. */
function Group(p: { title: string; children: ReactNode }) {
  return (
    <Box component="section" aria-label={p.title} sx={{ mt: 2 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>{p.title}</Typography>
      {p.children}
    </Box>
  );
}

/** One use case or answer, folded to its title. */
function Fold(p: { title: string; children: ReactNode }) {
  return (
    <Accordion disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, borderBottom: 1, borderColor: 'divider' }}>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography sx={{ fontWeight: 500 }}>{p.title}</Typography>
      </AccordionSummary>
      <AccordionDetails>{p.children}</AccordionDetails>
    </Accordion>
  );
}

/**
 * The guide (`/help`, decision 62), over My day like a task, in the order a
 * newcomer needs it (decisions 80, 92): the principles, each with the usual
 * things it replaces, five steps for the first day, diagrams of
 * the screen, the roles, a task's life and "My part", how to do the usual
 * things and why the unusual rules are so, both by topic — in the person's language, written for it,
 * not translated word by word.
 */
export default function () {
  const { i18n } = useTranslation();
  const help = GUIDES[i18n.language] ?? helpRu;

  return (
    <Stack spacing={2} sx={{ width: '100%', maxWidth: 960, mx: 'auto', alignSelf: 'flex-start' }}>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h2" sx={{ fontWeight: 600, mb: 1 }}>{help.title}</Typography>
        <Typography sx={{ mb: 1 }}>{help.intro}</Typography>
        {help.principles.map((principle) => (
          <Box key={principle.title} component="section" aria-label={principle.title} sx={{ mt: 2.5 }}>
            <Typography variant="h3" sx={{ fontWeight: 600 }}>{principle.title}</Typography>
            <Typography sx={{ mt: 0.5, mb: 1 }}>{principle.text}</Typography>
            {principle.instead.map((row) => (
              <Box
                key={row.usual}
                sx={{
                  display: 'grid', alignItems: 'center', columnGap: 1.5, rowGap: 0.5, py: 1, borderTop: 1, borderColor: 'divider',
                  gridTemplateColumns: { xs: 'minmax(0, 1fr) 16px minmax(0, 1fr)', sm: '190px 16px 210px minmax(0, 1fr)' },
                }}
              >
                <Typography component="s" sx={{ color: 'text.secondary' }}>{row.usual}</Typography>
                <ArrowForward sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography sx={{ fontWeight: 600 }}>{row.yartt}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', gridColumn: { xs: '1 / -1', sm: 'auto' } }}>{row.text}</Typography>
              </Box>
            ))}
          </Box>
        ))}
      </Paper>

      <Paper component="section" aria-label={help.quickStartTitle} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 1.5 }}>{help.quickStartTitle}</Typography>
        <Box component="ol" sx={{ m: 0, pl: 3 }}>
          {help.quickStart.map((step) => <Typography key={step} component="li" sx={{ mb: 1 }}>{step}</Typography>)}
        </Box>
      </Paper>

      <Paper component="section" aria-label={help.diagramsTitle} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 2 }}>{help.diagramsTitle}</Typography>
        <Diagrams diagrams={help.diagrams} />
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 1 }}>{help.scenariosTitle}</Typography>
        {help.scenarios.map((group) => (
          <Group key={group.title} title={group.title}>
            {group.items.map((scenario) => (
              <Fold key={scenario.title} title={scenario.title}>
                <Box component="ol" sx={{ m: 0, pl: 3 }}>
                  {scenario.steps.map((step) => <Typography key={step} component="li" variant="body2" sx={{ mb: 0.5 }}>{step}</Typography>)}
                </Box>
              </Fold>
            ))}
          </Group>
        ))}
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 1 }}>{help.faqTitle}</Typography>
        {help.faq.map((group) => (
          <Group key={group.title} title={group.title}>
            {group.items.map((item) => (
              <Fold key={item.q} title={item.q}>
                <Typography variant="body2">{item.a}</Typography>
              </Fold>
            ))}
          </Group>
        ))}
      </Paper>
    </Stack>
  );
}
