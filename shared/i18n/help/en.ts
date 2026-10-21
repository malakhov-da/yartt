import type { Help } from './ru.ts';

// The in-app guide in English.

export const helpEn: Help = {
  title: 'How to work in yartt',
  intro:
    'yartt is a task tracker without projects, subtasks or assignments. Everything for the day is on one screen, My day: '
    + 'what waits for you, your tasks, your team, your timesheet. A task is a set of tags, one owner and comments.',
  ideasTitle: 'The essentials',
  ideas: [
    {
      title: 'The title is tags',
      text: 'Rubrics ("website", "warehouse") group tasks; a phrase says what to do: "website · new homepage for the autumn campaign". '
        + 'A task may sit in several rubrics at once — no projects needed.',
    },
    {
      title: 'One owner',
      text: 'The owner answers for the result. Everyone else observes: helps, comments, logs time. '
        + 'No "done or not done" argument between whoever set the task and whoever did it.',
    },
    {
      title: 'A deadline closes the task by itself',
      text: 'When the deadline comes, the task is closed. Not going to make it — move the deadline in advance. Deadlines stay honest.',
    },
    {
      title: 'Seen by those who need it',
      text: "A task is seen by its observers; the owner's managers see it automatically. A task without observers is public. "
        + 'Its title, priority and deadline are visible to all, so anyone can ask for access.',
    },
    {
      title: 'Links instead of subtasks',
      text: 'A task can wait for another. A hard dependency ties the deadlines: the waiting task moves first, then the one it waits for.',
    },
    {
      title: 'Timesheet and a score of the day',
      text: 'A shift is when you worked; an entry is how much went to a task that day. A manager scores the whole day, not a task.',
    },
    {
      title: 'Works offline',
      text: 'Changes made without a connection are kept in the browser and sent when it is back.',
    },
  ],
  scenariosTitle: 'How to',
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
        'In the search of Current tasks, pick rubrics from the suggestions and type a phrase — what is to be done.',
        'Press "+" at the end of the field: a new task opens with that title. Add a priority, a deadline and a description.',
        'A task for another task is created from its page, under "Waits for" or "Waited on by": its title starts with that task\'s tags.',
      ],
    },
    {
      title: 'Bring a colleague in',
      steps: [
        'Mention them in a comment (@). They see it in Waiting for me and get access to the task.',
        'The mention is closed when they reply to the comment and press "Done".',
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
        "A line unfolds into charts; a person's page has their days and the score of each.",
        'Only the direct manager dismisses someone: their tasks and reports go to that manager.',
      ],
    },
    {
      title: 'See how tags are doing',
      steps: [
        'The Tags block: what happened under each rubric in a range — tasks, closings, comments, people.',
        'Pick several tags to see them together and one by one; a line unfolds into people and their time; export it as CSV.',
      ],
    },
    {
      title: 'Connect a program',
      steps: [
        'Profile → Bots: create a bot, tick what it may change and keep its key — it is shown once.',
        'The bot writes to tasks through the API and gets its notifications on its webhook.',
      ],
    },
  ],
  faqTitle: 'Why it is so',
  faq: [
    {
      q: 'Why does a task have no title?',
      a: 'People word titles differently, and one task is found five ways. A set of tags is unique, and the suggestions keep the '
        + 'vocabulary shared: "warehouse" is the same for everyone. Rubrics group; the phrase says what it is.',
    },
    {
      q: 'Why no projects or subtasks?',
      a: 'A project is a rigid hierarchy: a task belongs to one, and access to it is access to the whole project. Subtasks leave '
        + 'parents hanging. Tags and dependencies do the same without a hierarchy: a task may sit in several rubrics and wait for another.',
    },
    {
      q: 'Why no assignee?',
      a: 'With someone who sets the task and someone who does it, responsibility blurs and a task hangs on whoever cannot close it. '
        + 'In yartt one owner answers; help is asked with a mention, and a task is handed over whole.',
    },
    {
      q: 'Why does a task close by itself when its deadline comes?',
      a: 'Otherwise deadlines stop meaning anything. Not going to make it — move the deadline before it comes, or say in a comment '
        + 'why the task is closed but not done. A manager sees tasks closed by their deadline apart from those closed by hand.',
    },
    {
      q: 'Why can a task not be deleted, nor a comment edited?',
      a: 'History should not get lost: metrics and links to the task stay right. An outdated comment is not edited but answered. '
        + 'To avoid sending something by mistake, a comment can be pulled back into editing for a few seconds.',
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
      a: 'For someone who keeps the timesheet honestly it adds nothing. And the temptation to pad hours goes away: the ribbon of the day '
        + 'shows when a person was here and whether that agrees with the shifts. Transparency is the same for everyone in the chain.',
    },
    {
      q: 'Why is time on a task one entry a day?',
      a: 'The timesheet is about the day: how much went to the task today. One entry keeps time from being counted twice by accident; '
        + 'a correction is replacing the value.',
    },
    {
      q: 'Why does Enter not create a tag?',
      a: 'A typo should not become a new tag. A new tag is its own button, offered only when no such tag exists. '
        + 'Text left unpicked becomes one tag when the task is created — its phrase.',
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
