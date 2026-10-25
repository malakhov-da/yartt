import type { Help } from './ru.ts';

// The in-app guide in English.

export const helpEn: Help = {
  title: 'How to work in yartt',
  intro: 'yartt stands on four principles. Each drops something usual and puts in its place something that bends further.',
  principles: [
    {
      title: 'A result has one owner',
      text: 'When two people answer for a task, nobody does. So a task has one owner, and its deadline is their promise, not a wish.',
      instead: [
        { usual: 'A reporter and an assignee', yartt: 'An owner and participants', text: 'The owner decides when the task is done. Participants work in it but do not close it.' },
        { usual: 'Statuses', yartt: 'A deadline', text: 'A task is open until its deadline and closes by itself when it comes.' },
      ],
    },
    {
      title: 'Seen by those invited',
      text: 'A task may hold salaries, clients, people. Access to it is given by people, by name, not by a title or a project membership.',
      instead: [
        { usual: 'Access to a whole project', yartt: 'An invitation to the task', text: 'A task is seen by its participants and their managers. Everyone else sees its tags, priority and deadline: they can find it and ask for access.' },
        { usual: 'Roles and admins', yartt: 'Relationships', text: 'Rights come from owning a task, taking part in it and being someone\'s direct manager.' },
      ],
    },
    {
      title: 'Links, not a hierarchy',
      text: 'Work does not fit a tree: a task touches several directions at once and may be needed by several others.',
      instead: [
        { usual: 'A title', yartt: 'A set of tags', text: '"website · homepage · banner". The set is unique and the suggestions offer existing tags, so the same thing gets the same name.' },
        { usual: 'A project', yartt: 'A shared tag', text: 'A task can be in several "projects" at once. A new tag appears when it is needed.' },
        { usual: 'A subtask', yartt: 'A "Waits for" link', text: 'One task can be needed by several. A latest deadline shows where a promise is at risk.' },
      ],
    },
    {
      title: 'The figures tell the truth',
      text: 'The tracker forbids nothing, so there is no reason to fool it. The timesheet and scores are optional, and when kept, they show the work, not zeal.',
      instead: [
        { usual: 'Percent done', yartt: '"5h → 3h"', text: 'How much everyone has logged and still plans: hours measure the amount of work, not people.' },
        { usual: 'Scoring results', yartt: 'Scoring the day\'s decisions', text: 'Were the priorities right, was help asked for in time. A task\'s result also depends on plans and chance.' },
      ],
    },
  ],
  quickStartTitle: 'Your first day: five steps',
  quickStart: [
    'Open My day (the only screen) and work through Waiting for me on top. The goal is an empty list.',
    'Your tasks are in Available tasks. My open: those you own or plan time on. Other open: those you take part in.',
    'Make a task: pick tags from the suggestions in the search, type your own and press "New task". There is no separate title: the tags are the title.',
    'Bring people in with "Add a participant" on the task\'s page. A participant sees the task but is not notified of comments. '
      + 'Need their answer? Mention them with @.',
    'If you keep a timesheet, start the shift with ▶ in the top line, close it in the evening and log your time to tasks.',
  ],
  diagramsTitle: 'How it fits together',
  diagrams: {
    roles: {
      title: 'Who is who in a task',
      owner: 'Owner',
      ownerWho: 'Whose initiative it is — one per task',
      ownerDoes: ['decides when the task is done', 'sets and moves the deadline', 'removes participants not needed', 'answers for the result'],
      participant: 'Participants',
      participantWho: 'Those brought into the task',
      participantDoes: ['comment and answer mentions', 'bring others in', 'plan their time and log hours', 'take a big part into a task of their own — "My part"'],
      manager: 'Managers',
      managerWho: 'Added by themselves, up the chain',
      managerDoes: ['see the tasks of their people', 'may hand over a report\'s task', 'stay while their person is in the task'],
      handover: 'Handing ownership over gives the initiative away whole: the new owner may close the task. '
        + 'Need someone only to do the work? Bring them in as a participant.',
    },
    lifecycle: {
      title: 'A task\'s life: the deadline closes it',
      steps: [
        { title: 'Created', text: 'Whoever created it owns it. Only participants see it.' },
        { title: 'In work', text: 'Comments, mentions, participants\' plans and time.' },
        { title: 'A day before the deadline', text: 'In the owner\'s Waiting for me: "Closes by itself in …". All done — "Finish"; not making it — move the deadline.' },
        { title: 'The deadline comes', text: 'The task is closed. The owner confirms it or opens it again.' },
      ],
      finish: '"Finish" closes it earlier: the deadline becomes "now".',
    },
    part: {
      title: 'My part: a task of your own within someone else\'s initiative',
      main: 'The owner\'s task',
      mainOwner: 'owner — Emily',
      waits: 'waits for',
      sub: 'My part',
      subOwner: 'owner — Jack',
      steps: [
        'Jack takes part in Emily\'s task. His part is big, so he presses "My part" under "Waits for".',
        'The new task is Jack\'s: he describes it within his bounds and decides when it is done. Emily\'s task now waits for it.',
        'Jack closed his task. Emily\'s Waiting for me says "A task this one waits for is done".',
      ],
    },
    myDay: {
      title: 'Where things are',
      topLine: 'The top line',
      topItems: ['▶ shift', '🔔 waiting for me', '? guide', 'profile'],
      blocks: [
        { title: 'Waiting for me', text: 'mentions, new comments, requests, reminders, deadlines — by task' },
        { title: 'Waiting for others', text: 'your requests and mentions that wait for others' },
        { title: 'Available tasks', text: 'mine · team open · others · closed; the tag search' },
        { title: 'Folded blocks', text: 'my team, tags, hour budgets, bots, my files: open the one you need, it stays open' },
      ],
      side: { title: 'Timesheet', text: 'shifts, time entries and activity, today and the day before' },
    },
  },
  scenariosTitle: 'How to',
  scenarios: [
    {
      title: 'Every day',
      items: [
        {
          title: 'Sign in',
          steps: [
            'There are no passwords: enter your work email and a sign-in link is sent. If the company signs in through its own accounts '
              + '(SSO), press the button to sign in with them.',
            'The company account gives no confirmed email? The first time, yartt asks for your work email and sends a link to it. '
              + 'Open it in the same browser.',
            'The sign-in email is changed in the profile: the new address is confirmed by a link sent to it.',
            'yartt can be installed as an app (browser menu → Install). Offline, changes wait in the browser and go out when the connection is back.',
          ],
        },
        {
          title: 'Work through Waiting for me',
          steps: [
            'Everything that needs your reaction sits under the line of its task.',
            'A mention: reply and press "Done".',
            'New comments on your task: "Read" opens it. Nothing needs your decision? Press "No intervention needed" there.',
            'An access request to your task: approve or reject it.',
            'A task yours waits for has closed: mark it "Noted". An email comes too.',
            'Your task\'s deadline is near or has passed: what to do is under "Close a task".',
            'Waiting for others, below, is the other way round: your requests and mentions waiting for others. The longest waiting '
              + 'on top; a request can be withdrawn right there.',
          ],
        },
        {
          title: 'Find a task',
          steps: [
            'The search of Available tasks forgives typos, transliteration and the wrong keyboard layout. A task is found by number too: #12.',
            'A click in the empty field lists the rubrics of your tasks. The title of a new task works the same way.',
            'Picked tags narrow every tab. A manager also has Team open: the tasks of their people down the chain.',
            'A task number (#12) is a link to the task wherever it is shown. A click on a tag in a task\'s line adds it to the search.',
            'Hover a task in any list to see its description and how much each person has spent and still plans.',
          ],
        },
        {
          title: 'Remind yourself',
          steps: [
            'A reminder says "I will deal with this from then on". Until then the task is off your mind.',
            '"Remind me" on a task\'s page: from when and, if needed, about what. Only you see the reminder.',
            'At that moment you are notified and the task goes into Waiting for me. It stays there until you press "Done" or put the '
              + 'reminder off: by an hour, to tomorrow, to Monday, to a day before the deadline or to a time you pick.',
          ],
        },
        {
          title: 'Keep the timesheet and a plan',
          steps: [
            '"Start the shift" and "Finish" mark this moment. Add a forgotten shift with the clock icon of a day. If you worked '
              + 'but wrote no shift, yartt suggests one itself: "Looks like a shift".',
            'A shift lies within one day and ends by 00:00: work after midnight is a shift of the next day. Shifts do not overlap; '
              + 'when another is in the way, yartt names its times.',
            'A task gets one entry a day. "Log time" shows what is there: a new value replaces it, 0 removes it. '
              + 'A day takes at most 24 hours, all tasks together.',
            '"My plan" is how much more you mean to spend on a task and, if you like, on what. When the plan does not fit your time '
              + 'before the deadline, the task is "At risk".',
            'A day can be fixed until your manager scores it. A scored day is fixed only once the score is withdrawn.',
            'All your days are in History.',
          ],
        },
        {
          title: 'Go on vacation',
          steps: ['The calendar icon in the top line: say when you are back. Until then your notifications are copied to your manager.'],
        },
      ],
    },
    {
      title: 'Tasks',
      items: [
        {
          title: 'Create a task',
          steps: [
            'In the search of Available tasks, pick tags from the suggestions and type what is to be done.',
            'Enter takes the existing tag spelled the same way, and if there is none, makes the text a new tag. The suggestions '
              + 'forgive typos. Until the task is saved, a new tag is dashed: you see it is new and can remove it.',
            'The task exists already? A link to it appears under the field, with similar tasks carrying the same tags below. Look before starting a new one.',
            'Press "New task" in the block\'s title row to open the new task. Add a priority, a deadline and a description.',
            'A task for someone else stays yours: bring them in under "Participants" in the form, and they start their own part themselves.',
            'A follow-up task is created from the page of the original, under "Waits for" or "Waited on by". It gets the original\'s tags.',
          ],
        },
        {
          title: 'Run your task',
          steps: [
            'The owner changes the tags, description, priority and deadline right on the task\'s page.',
            'Participants and Opened it show who opened the task and when, how much each spent and how much they plan.',
            '"Hand over" gives the whole task to another owner, and you stay a participant. A manager can hand over their report\'s task too.',
            'Anyone may "Leave the task" except its owner, and a manager while their report takes part.',
            'A task without an owner (they left and had no manager) any participant can "Take it".',
          ],
        },
        {
          title: 'Close a task',
          steps: [
            '"Finish" closes the task at once. Otherwise it closes by itself at its deadline.',
            'A task closed by its deadline the owner confirms with "Confirm" or opens again with "Open again" and a new deadline.',
            'It is confirmed once nobody has time planned on it. Whoever does gets "Clear my plan" in Waiting for me.',
            'To reopen a closed task, clear or move its deadline. Closed tasks are in the Closed tab, the most recent first.',
            'Changes of the deadline within a minute count as one: owners of dependent tasks are told once it has stood for a minute.',
          ],
        },
        {
          title: 'Discuss in a task',
          steps: [
            'A comment is formatted text with images and files. # attaches a task, @ mentions a participant, and #12 in the text becomes a link.',
            'After "Send" a comment can be pulled back into editing for a few seconds. Then it is never changed or deleted.',
            '"Reply" starts a thread under a comment; the feed keeps a mark at the moment of the reply.',
            'An unfinished comment, form or edit stays as a draft when you leave the page.',
          ],
        },
        {
          title: 'Keep files',
          steps: [
            'The size of one file and the total of yours are limited by the administrator. Nothing is deleted by age.',
            'My files, at the bottom of My day, shows how much is taken and lets go of what you do not need.',
            'A file is kept while at least one person keeps it. Need someone else\'s file? Press "Keep in my files" by it: '
              + 'it stays with you even if its author lets it go.',
            'A file nobody keeps loses its content but not its link. Upload the same file again and the link works again.',
          ],
        },
        {
          title: 'Link tasks',
          steps: [
            'On a task\'s page, "Waits for" is what it cannot be finished without, "Waited on by" is who needs it. A task is found by tags or number.',
            'Links in "Waits for" are added by the owner. A participant adds there only a new task of their own, with "My part" (see the diagram above).',
            'A latest deadline is the moment the task waited for must not finish after. The owner of the waiting task sets it by '
              + 'clicking "needed by …" or "no latest deadline" on the link\'s line. Without one the link only shows the order.',
            'Nothing is forbidden. When the task waited for is late or has no deadline, the link\'s line is highlighted '
              + 'and both tasks are "At risk".',
            'The owner of the task waited for is told of a new link; the owner of the waiting one, of every move of its deadline.',
          ],
        },
      ],
    },
    {
      title: 'People and access',
      items: [
        {
          title: 'Bring someone in and ask for help',
          steps: [
            'Any participant adds participants, like a copy in an email. The owner removes whoever is not needed.',
            'A participant gets access, not an order: they see the task and are not notified of comments.',
            'Need an answer or an action? Mention the person (@) and say what is needed. The request lands in their Waiting for me '
              + 'and is closed by their reply and "Done".',
            'Only those in the task can be mentioned; in a public task, anyone. Add the others first.',
            'A lot of work? They make a task of their own with "My part".',
          ],
        },
        {
          title: "Ask for access to someone else's task",
          steps: [
            "Someone else's private task shows in the search: tags, priority and deadline. Open it and press \"Request access\".",
            'The owner approves or rejects the request, and you are notified. Until then you can withdraw it.',
          ],
        },
        {
          title: 'Make a task public',
          steps: [
            'A task that concerns everyone (an office move, a shared service) the owner makes public. Everyone sees it, comments and '
              + 'logs time on it, and its list of participants is empty.',
            '"Make private" keeps the owner, their managers and everyone with an open mention. Those who commented come back with one click.',
          ],
        },
        {
          title: 'Invite a colleague',
          steps: ['The person-with-a-plus icon in the top line: enter their email and an invitation is sent. If the company signs in '
            + 'through its own accounts (SSO), people appear by themselves on their first sign-in.'],
        },
        {
          title: 'Make it yours',
          steps: [
            'Profile (your avatar in the top line): name, photo, about, language, time zone, keyboard layouts, light or dark theme.',
            'You pick your manager in the profile yourself, and they are notified.',
            'My tags: the color and weight of a tag are yours alone. Weight sets the order of tags in a title, color helps spot tasks in lists.',
            'Notifications come to the bell in the top line and by email in your language. The company may connect other channels too.',
          ],
        },
      ],
    },
    {
      title: 'Team, tags, automation',
      items: [
        {
          title: 'Manage a team',
          steps: [
            'The My team block: for each person, the share of the timesheet in tasks, scores, tasks at risk and delays. The longest unseen on top.',
            'A line unfolds into charts. A person\'s page shows their My day as they see it (without their reminders) and all their days for any period.',
            'A score of the day is 0 to 100 with a reason. The person gets an email. A score can be changed (another email goes out) '
              + 'or withdrawn so they can fix their timesheet.',
            '"Export" saves the timesheet, entries and scores of the picked people for a period as Excel or CSV, for payroll.',
            'Every Monday an email comes: days waiting for a score, tasks closed by their deadline and tasks at risk.',
            'Only the direct manager dismisses someone: the dismissed person\'s tasks and reports go to that manager. '
              + 'The dismissed come back from "My dismissed" under the team table.',
          ],
        },
        {
          title: 'See how tags are doing',
          steps: [
            'The Tags block: what happened to the tasks of each tag from the day you pick to today. Open, closed, comments, people, '
              + 'who plans time; "?" by a column explains its figure.',
            'The tags with the most tasks "In work" are on top. Click a column\'s heading to sort by it.',
            'Pick several tags to see them together and one by one.',
            'A line unfolds into charts by day: how much each person logged and how much they still plan.',
            '"Export" saves it all as CSV.',
          ],
        },
        {
          title: 'Keep a direction within an hour budget',
          steps: [
            'The Hour budgets block → New budget: tags, a period and how many hours you and your reports may spend on them. '
              + 'A task counts when it carries all those tags.',
            'A line shows what is logged and the forecast: logged plus the part of the plans that fits before the end of the period '
              + 'at the pace of the last 28 days. A plan for a year does not all go into a half-year budget.',
            'Unfolded, a line shows the running total against the budget and the history of changes.',
            'Setting My plan on a task under a budget, you see the forecast it would make.',
            'Changing a budget makes a new version, and the old one stays in the history. Your managers and your reports see it.',
          ],
        },
        {
          title: 'Set up automation',
          steps: [
            'A bot is an account for builds, monitoring and integrations. Profile → Bots: create one, tick what it may change '
              + 'and keep its key. The key is shown once.',
            'A bot works with tasks through the API (say, reports a broken build with a mention) and gets its notifications on its webhook.',
            'The Bots block shows whether it works: calls by day and refusals.',
          ],
        },
      ],
    },
  ],
  faqTitle: 'Why it is so',
  faq: [
    {
      title: 'Tasks',
      items: [
        {
          q: 'Why does a task have no title?',
          a: 'People word titles differently, and one task is searched for five ways. A set of tags is unique, and the suggestions '
            + 'offer the tags that already exist, so the same thing usually gets the same name. Synonyms do not vanish entirely, '
            + 'but they are rare. And a tag that says exactly what is specific to a task can always be made.',
        },
        {
          q: 'Why no projects or subtasks?',
          a: 'A project is a rigid hierarchy: a task belongs to one, and access to it comes with the whole project. Tags group the '
            + 'same way without a hierarchy, and access stays with those invited. A subtask is tied to one parent; a dependency is '
            + 'not: one task may be needed by several, and deadlines are tied where it really is a promise.',
        },
        {
          q: 'Why are tasks linked only by "Waits for"?',
          a: 'Waiting means something: one task cannot end before another, and the deadlines are checked. "Related to" constrains '
            + 'nothing and only adds arrows. Tasks are related by their tags: a click on a tag finds every task with it, and a '
            + 'follow-up task or "My part" starts with the original\'s tags.',
        },
        {
          q: 'Why no reporter and assignee?',
          a: 'With two of them responsibility blurs: the task hangs on an assignee who cannot close it. The owner is whose initiative '
            + 'it is: they decide the task is done, move its deadline and answer if it closed undone. So the doer is not made the '
            + 'owner: they could close the task without doing it.',
        },
        {
          q: 'Why does a task close by itself when its deadline comes?',
          a: 'So that whoever started the task truly answers for its deadline. If you do not want it closed, set a real deadline '
            + 'and move it in advance. A manager sees tasks closed by their deadline apart from those closed by hand.',
        },
        {
          q: 'Why no start date and no "planned" status?',
          a: 'Statuses and start dates go stale before anyone updates them. The deadline sets the order, and the agreement is the '
            + 'person\'s own plan: they were brought in and put hours in "My plan". When the plan does not fit their time before '
            + 'the deadline, the task is "At risk", and that shows early. How much a person has planned already shows in My team (backlog).',
        },
        {
          q: 'Why no percentage done on a task?',
          a: 'Hours logged are not work done: a task may take 90% of its hours and be half done. So a task\'s line says "5h → 3h": '
            + 'how much was logged and how much is left in the plans. A plan is the time left, revised as the work goes.',
        },
        {
          q: 'Why can a task not be deleted, nor a comment edited?',
          a: 'History should not get lost: metrics and links to the task stay right. An outdated comment is answered, not edited. '
            + 'To avoid sending something by mistake, a comment can be pulled back into editing for a few seconds.',
        },
        {
          q: 'Why is there no "All tasks" tab?',
          a: 'Open tasks need attention, closed ones are for reference, so they are on different tabs. With a search by tags every '
            + 'tab shows how many it found: a closed match shows without switching.',
        },
        {
          q: 'Why one screen, without sections or a menu?',
          a: 'What waits for you and your tasks is always on top; the rest is folded into lines below. There were separate sections, '
            + 'but a manager needs a report\'s day on one screen, seen with their eyes.',
        },
        {
          q: 'What does "At risk" mean?',
          a: "One of two. Someone's plan does not fit their working time before the deadline: each person's time is compared with "
            + 'their own. Or a latest deadline is broken: the task waits for one due later than it can live with, or it delays a '
            + 'task waiting for it. The reason is in the hint on the mark.',
        },
      ],
    },
    {
      title: 'People and access',
      items: [
        {
          q: 'Why can I not mention someone who is not in the task?',
          a: 'A mention addresses a participant; it does not open access. Access is opened openly: the person is added to the task '
            + 'and notified of it. The owner removes whoever is not needed, so a task never spreads quietly.',
        },
        {
          q: 'Why can a mention not be closed without a reply?',
          a: 'Whoever mentioned must know the request reached the person. "Done" without a reply leaves them guessing: read or not, '
            + 'taken up or not. A short reply is enough: "got it, I will look on Thursday". To only let someone know, add them as '
            + 'a participant without a mention.',
        },
        {
          q: 'How does "Done" differ from "No intervention needed"?',
          a: '"Done" closes a mention: whoever was mentioned presses it after replying. "No intervention needed" is pressed by the '
            + 'owner once they have read the new comments and decided nothing is needed of them. It sits in the task next to the '
            + 'comments, not in Waiting for me, so comments are never skipped unread.',
        },
        {
          q: "Why do managers see their reports' tasks?",
          a: 'A manager answers for their people and needs to see what they are busy with. So they take part in every task of their '
            + 'reports, all the way up the chain, with no permissions to set. It adds no noise: comments notify only the owner '
            + 'and those mentioned.',
        },
        {
          q: 'Why does an employee choose their own manager?',
          a: 'Choosing a manager opens one\'s own tasks to them and gives them the right to score one\'s days, and gets nothing of '
            + 'anyone else\'s. So the choice is for whoever the data belongs to. The chosen manager is notified, so no swap goes unseen.',
        },
        {
          q: "How do directors see each other's tasks?",
          a: 'They pick each other as managers in the profile: managers may form a ring. Then each sees everything to do with the '
            + 'others, as a manager does. The rights stay with the direct manager: in a ring each may score the days of, and '
            + 'dismiss, whoever picked them as manager.',
        },
        {
          q: 'Why does my manager see my activity?',
          a: 'For transparency and trust. It works for an honest employee: the manager sees how the work really goes and trusts them '
            + 'more. And looking busy only on paper gets hard: the ribbon of the day shows when a person was here and whether that '
            + 'agrees with their shifts and entries. The rules are the same for everyone in the chain. Activity is not counted as '
            + 'time, nor scored. Opening an old task to look something up is normal work, so a closed task is not listed among '
            + '"Opened without logging".',
        },
      ],
    },
    {
      title: 'Time and scores',
      items: [
        {
          q: 'Do I have to keep the timesheet and score days?',
          a: 'No. The timesheet, entries, plans and scores are optional. Without them you keep tasks with tags and access by '
            + 'invitation; time and scores come in when you want transparency.',
        },
        {
          q: 'Why do a task\'s hours add up, while people are not compared by hours?',
          a: 'Hours on a task or a tag are the amount of work. When tasks go by level, the simple ones to juniors and the hard ones to '
            + 'seniors, a task takes about the same time whoever fit for it does it. So a task and a tag show how much was logged '
            + 'in all and how much is still planned. But more hours is not more done, so My team shows shares of each one\'s own '
            + 'time, scores and counts.',
        },
        {
          q: 'Why is time on a task one entry a day?',
          a: 'The timesheet is about the day: how much went to the task today. One entry keeps time from being counted twice by '
            + 'accident, and a correction is replacing the value.',
        },
        {
          q: 'Why can time be logged for past days?',
          a: 'A task is often written down after the work began, and a timesheet is filled in at the end of a day or a week. A ban '
            + 'would hit the honest. Late filling shows anyway: an entry has its date, My team shows how late the timesheet is '
            + 'written, and a scored day can no longer change.',
        },
        {
          q: 'Why does an hour budget forbid nothing?',
          a: 'A budget is a guide: it helps notice in time that the work went off plan. An overrun shows in the plan dialog, before '
            + 'the hours are spent. A ban would not make the work smaller: the time would be logged elsewhere, and the figures would '
            + 'stop being true. What to spend hours on beyond a budget is for people to decide, not a counter.',
        },
        {
          q: 'Why is the day scored, and by what?',
          a: 'A task takes months and ten people: it is unclear whom to score and for what. A task\'s result depends on plans, '
            + 'colleagues and chance; the day\'s decisions depend on the person. So decisions are scored: were the priorities right, '
            + 'was help asked for in time, was nothing needless taken on. The manager writes a reason with every score, so scores '
            + 'do not slide into liking and disliking. A task may fail while the scores are good: then the plans are the problem, '
            + 'not the person.',
        },
        {
          q: 'Why no metrics of estimate accuracy, deadline moves or priorities?',
          a: 'Such metrics teach people to play the tracker instead of working: rewarded for accurate estimates, they pad them; for '
            + 'few moves, they set deadlines with a margin; for many tasks, they split them. My team shows only what cannot be '
            + 'improved by working worse: the share of one\'s time in tasks, scores, reaction to mentions, how late the timesheet is '
            + 'written, whether the backlog grows.',
        },
      ],
    },
  ],
};
