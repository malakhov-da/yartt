import { ArrowForward, Groups, Person, SupervisorAccount } from '@mui/icons-material';
import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { Help } from '#shared/i18n/help/ru.ts';

// The guide's diagrams (decision 80): drawn from the guide's own words, so
// they read in every language and never go stale like screenshots.

type Diagrams = Help['diagrams'];

/** An arrow between steps: right on a wide screen, down on a narrow one. */
function Arrow(p: { label?: string }) {
  return (
    <Stack sx={{ alignItems: 'center', justifyContent: 'center', color: 'text.secondary', flexShrink: 0, px: 0.5 }}>
      <ArrowForward sx={{ transform: { xs: 'rotate(90deg)', md: 'none' } }} />
      {p.label && <Typography variant="caption">{p.label}</Typography>}
    </Stack>
  );
}

function Card(p: { title: string; sub?: string; icon?: ReactNode; accent?: boolean; children?: ReactNode }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, flex: 1, minWidth: 0, borderColor: p.accent ? 'primary.main' : 'divider', borderWidth: p.accent ? 2 : 1 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {p.icon && <Box sx={{ color: p.accent ? 'primary.main' : 'text.secondary', display: 'flex' }}>{p.icon}</Box>}
        <Typography sx={{ fontWeight: 600 }}>{p.title}</Typography>
      </Stack>
      {p.sub && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{p.sub}</Typography>}
      {p.children}
    </Paper>
  );
}

function Bullets(p: { items: string[] }) {
  return (
    <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
      {p.items.map((item) => <Typography key={item} component="li" variant="body2">{item}</Typography>)}
    </Box>
  );
}

const row = { direction: { xs: 'column', md: 'row' }, spacing: 1, sx: { alignItems: 'stretch' } } as const;

function Roles(p: { d: Diagrams['roles'] }) {
  const { d } = p;
  return (
    <Stack spacing={1.5}>
      <Stack {...row}>
        <Card title={d.owner} sub={d.ownerWho} icon={<Person />} accent><Bullets items={d.ownerDoes} /></Card>
        <Card title={d.participant} sub={d.participantWho} icon={<Groups />}><Bullets items={d.participantDoes} /></Card>
        <Card title={d.manager} sub={d.managerWho} icon={<SupervisorAccount />}><Bullets items={d.managerDoes} /></Card>
      </Stack>
      <Typography variant="body2" sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>{d.handover}</Typography>
    </Stack>
  );
}

function Lifecycle(p: { d: Diagrams['lifecycle'] }) {
  return (
    <Stack spacing={1.5}>
      <Stack {...row}>
        {p.d.steps.map((step, i) => (
          <Stack key={step.title} direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            {i > 0 && <Arrow />}
            <Card title={step.title} accent={i === p.d.steps.length - 1}>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{step.text}</Typography>
            </Card>
          </Stack>
        ))}
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.d.finish}</Typography>
    </Stack>
  );
}

function Part(p: { d: Diagrams['part'] }) {
  const { d } = p;
  return (
    <Stack spacing={1.5}>
      <Stack {...row} sx={{ alignItems: { md: 'center' } }}>
        <Card title={d.main} sub={d.mainOwner} icon={<Person />} accent />
        <Arrow label={d.waits} />
        <Card title={d.sub} sub={d.subOwner} icon={<Person />} />
      </Stack>
      <Box component="ol" sx={{ m: 0, pl: 3 }}>
        {d.steps.map((step) => <Typography key={step} component="li" variant="body2" sx={{ mb: 0.5 }}>{step}</Typography>)}
      </Box>
    </Stack>
  );
}

function MyDay(p: { d: Diagrams['myDay'] }) {
  const { d } = p;
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', p: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography variant="caption" sx={{ fontWeight: 600, mr: 1 }}>{d.topLine}:</Typography>
        {d.topItems.map((item) => (
          <Typography key={item} variant="caption" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 0.75, bgcolor: 'background.paper' }}>
            {item}
          </Typography>
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ p: 1 }}>
        <Stack spacing={1} sx={{ flex: 3, minWidth: 0 }}>
          {d.blocks.map((block, i) => (
            <Card key={block.title} title={block.title} accent={i === 0}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{block.text}</Typography>
            </Card>
          ))}
        </Stack>
        <Box sx={{ flex: 2, minWidth: 0, display: 'flex' }}>
          <Card title={d.side.title}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{d.side.text}</Typography>
          </Card>
        </Box>
      </Stack>
    </Paper>
  );
}

/** Every diagram under its title, in the order a newcomer needs them. */
export default function (p: { diagrams: Diagrams }) {
  const { diagrams: d } = p;
  const items = [
    { title: d.myDay.title, body: <MyDay d={d.myDay} /> },
    { title: d.roles.title, body: <Roles d={d.roles} /> },
    { title: d.lifecycle.title, body: <Lifecycle d={d.lifecycle} /> },
    { title: d.part.title, body: <Part d={d.part} /> },
  ];
  return (
    <Stack spacing={4}>
      {items.map((item) => (
        <Box key={item.title} component="figure" sx={{ m: 0 }}>
          <Typography component="figcaption" variant="h3" sx={{ fontWeight: 600, mb: 1 }}>{item.title}</Typography>
          {item.body}
        </Box>
      ))}
    </Stack>
  );
}
