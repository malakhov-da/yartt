import { ExpandMore } from '@mui/icons-material';
import { Accordion, AccordionDetails, AccordionSummary, Box, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { helpEn } from '#shared/i18n/help/en.ts';
import { helpRu, type Help } from '#shared/i18n/help/ru.ts';
import Diagrams from './HelpPage/Diagrams.tsx';

const GUIDES: Record<string, Help> = { ru: helpRu, en: helpEn };

/**
 * The guide (`/help`, decision 62), over My day like a task, in the order a
 * newcomer needs it (decision 80): five steps for the first day, diagrams
 * of the screen, the roles, a task's life and "My part", the essentials, how
 * to do the usual things, the words used, and why the unusual rules are so
 * — in the person's language, written for it, not translated word by word.
 */
export default function () {
  const { i18n } = useTranslation();
  const help = GUIDES[i18n.language] ?? helpRu;

  return (
    <Stack spacing={2} sx={{ width: '100%', maxWidth: 960, mx: 'auto', alignSelf: 'flex-start' }}>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h2" sx={{ fontWeight: 600, mb: 1 }}>{help.title}</Typography>
        <Typography>{help.intro}</Typography>
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
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 2 }}>{help.ideasTitle}</Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {help.ideas.map((idea) => (
            <Box key={idea.title}>
              <Typography sx={{ fontWeight: 600 }}>{idea.title}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{idea.text}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 1 }}>{help.scenariosTitle}</Typography>
        {help.scenarios.map((scenario) => (
          <Accordion key={scenario.title} disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, borderBottom: 1, borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ fontWeight: 500 }}>{scenario.title}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box component="ol" sx={{ m: 0, pl: 3 }}>
                {scenario.steps.map((step) => <Typography key={step} component="li" variant="body2" sx={{ mb: 0.5 }}>{step}</Typography>)}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      <Paper component="section" aria-label={help.glossaryTitle} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 1.5 }}>{help.glossaryTitle}</Typography>
        <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'max-content 1fr' }, columnGap: 2, rowGap: 0.75 }}>
          {help.glossary.map((item) => (
            <Box key={item.term} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="body2" sx={{ fontWeight: 600 }}>{item.term}</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, mb: { xs: 1, sm: 0 } }}>{item.text}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 1 }}>{help.faqTitle}</Typography>
        {help.faq.map((item) => (
          <Accordion key={item.q} disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, borderBottom: 1, borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ fontWeight: 500 }}>{item.q}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">{item.a}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>
    </Stack>
  );
}
