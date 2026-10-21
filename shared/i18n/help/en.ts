import type { Help } from './ru.ts';

// The in-app guide in English.

export const helpEn: Help = {
  title: 'How to work in yartt',
  intro:
    'yartt is a task tracker built around responsibility and security. It does not just do without projects, subtasks '
    + 'and assignees — it replaces them with more flexible mechanisms: tags instead of projects, dependencies instead of '
    + 'subtasks, one owner instead of an assignee, observers invited by name instead of access for "everyone on the project". '
    + 'The timesheet, time entries and scores of the day make work transparent, yet all of it is optional: you can use '
    + 'only tasks and tags. Everything for the day is on one screen, My day.',
  ideasTitle: 'The essentials',
  ideas: [
    {
      title: 'Whoever starts a task answers for it',
      text: 'A task is run by its owner — whoever created it or was handed it. Only they decide when it is done and move its deadline. '
        + 'Observers are not "assignees" but full participants: they solve their part in a task of their own or right in this one '
        + 'when the part is small, like a reviewer\'s — and they plan their time and log their effort just the same.',
    },
    {
      title: 'Access only for those invited',
      text: "A task is seen by its observers and by the owner's managers up the chain. Observers are added by name, so an important "
        + 'idea does not spread to "everyone on the project". Tags, priority and deadline are visible to all — a task can be found '
        + 'and access asked for. A task without observers is public.',
    },
    {
      title: 'Tags instead of projects',
      text: 'A task\'s title is a set of tags. A tag may stand for a project, a kind of work, a direction, an action or any context '
        + 'that says the point in brief: "website · homepage · lay out the banner". A task may sit in several "projects" at once, '
        + 'and a new tag for what is specific to it can be made at any moment.',
    },
    {
      title: 'Dependencies instead of subtasks',
      text: 'A follow-up task takes the tags of the one it came from and adds its own — no need to know in advance whether there will be '
        + '"subtasks". "Waits for" is more flexible than a subtask: one task may be needed by several. A hard dependency ties the '
        + 'deadlines, so what people promised each other is seen and kept in check.',
    },
    {
      title: 'A deadline closes the task by itself',
      text: 'When the deadline comes, the task is closed. That is on purpose: whoever started the task answers for a sensible deadline '
        + 'and watches it. Not going to make it — move the deadline in advance.',
    },
    {
      title: 'Time in the open',
      text: 'A shift is when a person worked, an entry is how much went to a task, a plan is how much is left. Together they give '
        + 'several views of the same time instead of one figure to be taken on trust. A manager can score an employee\'s day and give '
        + 'feedback. The timesheet, entries and scores are optional.',
    },
    {
      title: 'Works offline',
      text: 'Changes made without a connection are kept in the browser and sent when it is back.',
    },
  ],
  scenariosTitle: 'Use cases',
  scenarios: [
    {
      title: 'Start the day',
      steps: [
        'Waiting for me: mentions, new comments on your tasks, access requests. Reply, or press "Done".',
        'If nothing in your task needs you, press "No intervention needed": it leaves the list until a new comment.',
        'Start your shift with ▶ in the top line or in the Timesheet.',
      ],
    },
    {
      title: 'Create a task',
      steps: [
        'In the search of Current tasks, pick tags from the suggestions and type what is to be done.',
        'Press "+" at the end of the field: a new task opens and the text typed becomes a new tag — dashed until the task is saved. '
          + 'Add a priority, a deadline and a description.',
        'A follow-up task is created from the page of the original, under "Waits for" or "Waited on by": it gets its tags, '
          + 'and you add what is specific.',
      ],
    },
    {
      title: 'Give access or ask for help',
      steps: [
        'For a colleague to see the task and take part, add them as an observer. That is access, not an order: nothing is expected of them.',
        'To ask them to do something, mention them in a comment (@) and say what is needed. The request lands in their Waiting for me, '
          + 'and they get access to the task on their own.',
        'The mention is closed when they reply and press "Done". If there is a lot of work, they make a follow-up task, and yours waits for it.',
      ],
    },
    {
      title: 'Close or postpone',
      steps: [
        '"Finish" sets the deadline to now: the task is closed. To reopen it, clear or move the deadline.',
        'Closed tasks are in the Closed tab, the most recent first.',
      ],
    },
    {
      title: 'Keep the timesheet',
      steps: [
        '"Start the shift" and "Finish" act at this moment; add a forgotten shift with the clock icon of a day, or confirm the suggestion.',
        'Time on a task for a day is one entry: "Log time" shows what is there, a new value replaces it, 0 removes it.',
        'All your days are in History.',
      ],
    },
    {
      title: 'Go on vacation',
      steps: ['The calendar icon in the top line: say when you are back. Until then your notifications are copied to your manager.'],
    },
    {
      title: 'For a manager',
      steps: [
        'My team: the share of the timesheet in tasks, scores, tasks at risk and delays of each person; the longest unseen on top.',
        "A line unfolds into charts; a person's page has their days, where you can score a day and say why.",
        'Only the direct manager dismisses someone: their tasks and reports go to that manager.',
      ],
    },
    {
      title: 'See how tags are doing',
      steps: [
        'The Tags block: what happened to the tasks of each tag from any day to today — open, closed, comments, people, who plans time. '
          + '"?" by a column explains each figure.',
        'Pick several tags to see them together and one by one.',
        'A line unfolds into charts by day: how much time each person logged and how much they still plan.',
        '"Export" saves it all as CSV.',
      ],
    },
    {
      title: 'Set up automation',
      steps: [
        'A bot is an account for automation: builds, monitoring, integrations. Profile → Bots: create one, tick what it may change '
          + 'and keep its key — it is shown once.',
        'The bot works with tasks through the API — say, reports a broken build with a mention — and gets its notifications on its webhook.',
        'The Bots block in My day shows whether it works: calls by day and refusals.',
      ],
    },
  ],
  faqTitle: 'Why it is so',
  faq: [
    {
      q: 'Why does a task have no title?',
      a: 'People word titles differently, and one task is found five ways. A set of tags is unique, and the suggestions offer the tags '
        + 'that already exist, so the same thing usually gets the same name. Synonyms cannot be ruled out entirely, but they become rare. '
        + 'And nothing is lost: a tag that says exactly what is specific to a task can always be made.',
    },
    {
      q: 'Why no projects or subtasks?',
      a: 'A project is a rigid hierarchy: a task belongs to one, and access to it is access to the whole project. Tags group the same way '
        + 'without a hierarchy, and access stays with those invited to the task. A subtask is tied to one parent; a dependency is not: '
        + 'one task may be needed by several, and deadlines are tied where it really is a promise.',
    },
    {
      q: 'Why no assignee?',
      a: 'With someone who sets the task and someone who does it, responsibility blurs and a task hangs on whoever cannot close it. '
        + 'In yartt a task is run by its owner, and only they decide when it is done. Others solve their part: help is asked with '
        + 'a mention, and a big part of the work goes into a follow-up task.',
    },
    {
      q: 'Why does a task close by itself when its deadline comes?',
      a: 'So that whoever started the task truly answers for its deadline. If you do not want it closed, set a sensible deadline, '
        + 'watch it and move it in advance. A manager sees tasks closed by their deadline apart from those closed by hand.',
    },
    {
      q: 'Why can a task not be deleted, nor a comment edited?',
      a: 'History should not get lost: metrics and links to the task stay right. An outdated comment is not edited but answered. '
        + 'To avoid sending something by mistake, a comment can be pulled back into editing for a few seconds.',
    },
    {
      q: 'Do I have to keep the timesheet and score days?',
      a: 'No. The timesheet, entries, plans and scores of the day are optional. You can use only tasks and tags and still get their '
        + 'flexibility and secure access; time and scores come in when you want transparency.',
    },
    {
      q: 'Why is the day scored, not a task?',
      a: 'A task takes months and ten people — it is unclear whom to score and for what. A score of the day is about the person\'s '
        + 'decisions: were the priorities right. A task may fail while the scores are good — then the plans are the problem, not the person.',
    },
    {
      q: 'Why are hours of different people never added up?',
      a: "Different people's hours cost differently, and that is a trade secret. So you see shares of each person's own time, "
        + 'averages over people and counts — never the total hours of a team or a tag.',
    },
    {
      q: 'Why does my manager see my visits?',
      a: 'For transparency and trust. It works for an honest employee: the manager sees how the work really goes and can trust them more. '
        + 'And looking busy only on paper gets hard: the ribbon of the day shows when a person was here and whether that agrees with '
        + 'their shifts and entries. The rules are the same for everyone in the chain.',
    },
    {
      q: 'Why is time on a task one entry a day?',
      a: 'The timesheet is about the day: how much went to the task today. One entry keeps time from being counted twice by accident; '
        + 'a correction is replacing the value.',
    },
    {
      q: 'Why does Enter not create a tag?',
      a: 'Enter picks a tag that exists and never makes a new one: a typo should not become a tag. A new tag appears only on purpose — '
        + 'by the "New tag" button under the field, or when you create a task with text typed; until it is saved it is dashed, '
        + 'so you see it is new.',
    },
    {
      q: 'Why are there no roles or admins?',
      a: 'Rights follow relationships: the owner of a task, an observer, the direct manager. Nobody gets access by a title '
        + 'that is not in the org chart.',
    },
    {
      q: 'What does "At risk" mean?',
      a: "Someone's plan of time left does not fit into their working time before the deadline. Each person's time is compared with their own.",
    },
  ],
};
