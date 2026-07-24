export type StarterCollectionWord = {
  term: string;
  definition: string;
  example: string;
  partOfSpeech: string;
  group?: string;
};

export type WordWizStarterCollection = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: 'sparkles' | 'git-compare-outline';
  color: 'purple' | 'orange';
  words: StarterCollectionWord[];
};

const polishedVocabulary: StarterCollectionWord[] = [
  ['Articulate', 'Able to express ideas clearly.', 'Her articulate explanation made the plan easy to follow.', 'adjective'],
  ['Astute', 'Good at understanding situations quickly.', 'His astute question revealed the problem in the proposal.', 'adjective'],
  ['Candid', 'Honest and direct.', 'She gave candid feedback while still being kind.', 'adjective'],
  ['Coherent', 'Clear, logical, and well organized.', 'The report was coherent from its opening to its conclusion.', 'adjective'],
  ['Compelling', 'Very convincing or interesting.', 'The speaker made a compelling case for protecting the park.', 'adjective'],
  ['Concise', 'Expressing something clearly with few words.', 'Keep the email concise so the main request is easy to find.', 'adjective'],
  ['Credible', 'Believable and trustworthy.', 'The claim became credible after several sources confirmed it.', 'adjective'],
  ['Deliberate', 'Done carefully and intentionally.', 'They made a deliberate choice to test the idea first.', 'adjective'],
  ['Discern', 'To recognize or understand something.', 'With practice, you can discern a strong argument from a weak one.', 'verb'],
  ['Eloquent', 'Fluent and persuasive in speaking or writing.', 'Her eloquent toast made the room fall quiet.', 'adjective'],
  ['Empathetic', 'Able to understand another person’s feelings.', 'The empathetic coach listened before offering advice.', 'adjective'],
  ['Nuanced', 'Containing subtle differences or details.', 'The article gave a nuanced view of a complicated issue.', 'adjective'],
  ['Perceptive', 'Good at noticing and understanding things.', 'His perceptive observation helped the group solve the mystery.', 'adjective'],
  ['Pragmatic', 'Focused on practical results.', 'They chose a pragmatic solution that could be used right away.', 'adjective'],
  ['Rational', 'Based on reason and logic.', 'Try to make a rational decision after looking at the evidence.', 'adjective'],
  ['Resilient', 'Able to recover from difficulty.', 'The resilient team adjusted after the unexpected setback.', 'adjective'],
  ['Skeptical', 'Doubtful until evidence is provided.', 'She was skeptical of the headline until she checked the source.', 'adjective'],
  ['Substantial', 'Large, important, or meaningful.', 'The project required a substantial amount of planning.', 'adjective'],
  ['Versatile', 'Able to be used in many different ways.', 'A versatile notebook can hold sketches, plans, and reflections.', 'adjective'],
  ['Viable', 'Capable of working successfully.', 'The team found a viable way to finish before the deadline.', 'adjective'],
].map(([term, definition, example, partOfSpeech]) => ({ term, definition, example, partOfSpeech }));

const commonlyConfused: StarterCollectionWord[] = [
  ['Accept', 'To receive or agree to something.', 'I accept your invitation to the science fair.', 'verb', 'Accept / Except'],
  ['Except', 'Not including; excluding.', 'Everyone except Mia brought a notebook.', 'preposition', 'Accept / Except'],
  ['Affect', 'To influence or change something.', 'Lack of sleep can affect your focus.', 'verb', 'Affect / Effect'],
  ['Effect', 'A result or change caused by something.', 'The new routine had a positive effect on her energy.', 'noun', 'Affect / Effect'],
  ['Advice', 'A suggestion about what someone should do.', 'My teacher gave helpful advice before the presentation.', 'noun', 'Advice / Advise'],
  ['Advise', 'To give someone a suggestion.', 'I advise reading the instructions before you begin.', 'verb', 'Advice / Advise'],
  ['Allude', 'To hint at something without naming it directly.', 'The author alludes to a famous myth in the first chapter.', 'verb', 'Allude / Elude'],
  ['Elude', 'To escape or avoid being found or understood.', 'The answer continued to elude him until he drew a diagram.', 'verb', 'Allude / Elude'],
  ['Cite', 'To mention a source as evidence.', 'Please cite the article you used in your report.', 'verb', 'Cite / Site / Sight'],
  ['Site', 'A place or location.', 'The new library will be built on that site.', 'noun', 'Cite / Site / Sight'],
  ['Sight', 'The ability or act of seeing.', 'The mountain was an amazing sight at sunrise.', 'noun', 'Cite / Site / Sight'],
  ['Complement', 'Something that completes or goes well with something else.', 'The bright scarf is a complement to the dark coat.', 'noun', 'Complement / Compliment'],
  ['Compliment', 'A polite expression of praise.', 'He gave her a compliment about her clear speech.', 'noun', 'Complement / Compliment'],
  ['Ensure', 'To make certain that something happens.', 'Check the date to ensure you submit the form on time.', 'verb', 'Ensure / Insure'],
  ['Insure', 'To provide insurance for something.', 'They chose to insure the car before the trip.', 'verb', 'Ensure / Insure'],
  ['Farther', 'At or to a greater physical distance.', 'The trail continues farther into the forest.', 'adverb', 'Farther / Further'],
  ['Further', 'Additional or to a greater degree.', 'We need further information before deciding.', 'adjective', 'Farther / Further'],
  ['Fewer', 'A smaller number of countable things.', 'There were fewer cars on the road after midnight.', 'adjective', 'Fewer / Less'],
  ['Less', 'A smaller amount of something.', 'Use less sugar if you want the drink to be less sweet.', 'adjective', 'Fewer / Less'],
  ['Imply', 'To suggest something without saying it directly.', 'Her tone seemed to imply that the meeting was important.', 'verb', 'Imply / Infer'],
  ['Infer', 'To form a conclusion from clues or evidence.', 'From the wet sidewalk, we can infer that it rained.', 'verb', 'Imply / Infer'],
  ['Its', 'Belonging to it.', 'The dog wagged its tail when it saw us.', 'determiner', 'Its / It’s'],
  ['It’s', 'A short form of “it is” or “it has.”', 'It’s time to start the experiment.', 'contraction', 'Its / It’s'],
  ['Lay', 'To put or place something down.', 'Please lay the book on the table.', 'verb', 'Lay / Lie'],
  ['Lie', 'To rest in a flat position.', 'I like to lie down after a long hike.', 'verb', 'Lay / Lie'],
  ['Loose', 'Not tight or firmly fixed.', 'The loose button needs to be sewn back on.', 'adjective', 'Loose / Lose'],
  ['Lose', 'To misplace something or fail to keep it.', 'Do not lose your ticket before the concert.', 'verb', 'Loose / Lose'],
  ['Principal', 'Most important; also, the leader of a school.', 'The principal reason for the change was safety.', 'adjective', 'Principal / Principle'],
  ['Principle', 'A basic rule or belief.', 'Honesty is an important principle in our family.', 'noun', 'Principal / Principle'],
  ['Stationary', 'Not moving.', 'The bicycle remained stationary at the red light.', 'adjective', 'Stationary / Stationery'],
  ['Stationery', 'Writing materials such as paper and envelopes.', 'She bought colorful stationery for thank-you notes.', 'noun', 'Stationary / Stationery'],
  ['Than', 'Used to compare things.', 'This puzzle is harder than the last one.', 'conjunction', 'Than / Then'],
  ['Then', 'At that time or next in sequence.', 'Finish your notes, then check your work.', 'adverb', 'Than / Then'],
  ['Their', 'Belonging to them.', 'The students packed their lunches.', 'determiner', 'Their / There / They’re'],
  ['There', 'In or at that place.', 'Put the map over there by the window.', 'adverb', 'Their / There / They’re'],
  ['They’re', 'A short form of “they are.”', 'They’re bringing snacks for the trip.', 'contraction', 'Their / There / They’re'],
  ['Weather', 'The conditions outside, such as rain or sunshine.', 'The weather looks clear for tomorrow’s game.', 'noun', 'Weather / Whether'],
  ['Whether', 'Used when expressing a choice or uncertainty.', 'I do not know whether the store is open.', 'conjunction', 'Weather / Whether'],
  ['Your', 'Belonging to you.', 'Your idea made the project much stronger.', 'determiner', 'Your / You’re'],
  ['You’re', 'A short form of “you are.”', 'You’re ready to share your answer.', 'contraction', 'Your / You’re'],
  ['Who', 'Used to ask about or name the person doing an action.', 'Who brought the extra markers?', 'pronoun', 'Who / Whom'],
  ['Whom', 'Used to ask about or name the person receiving an action.', 'Whom did you invite to the meeting?', 'pronoun', 'Who / Whom'],
].map(([term, definition, example, partOfSpeech, group]) => ({ term, definition, example, partOfSpeech, group }));

function makeVocabularyCollectionWords(
  group: string,
  words: [string, string, string, string][],
): StarterCollectionWord[] {
  return words.map(([term, definition, example, partOfSpeech]) => ({
    term,
    definition,
    example,
    partOfSpeech,
    group,
  }));
}

const advancedEverydayIntelligence = makeVocabularyCollectionWords(
  'Advanced everyday intelligence',
  [
    ['Apropos', 'Relevant and appropriate to the situation.', 'Her apropos comment moved the meeting forward.', 'adjective'],
    ['Cursory', 'Quick and not thorough.', 'He gave the report a cursory glance before leaving.', 'adjective'],
    ['Disparate', 'Fundamentally different in kind.', 'The team combined disparate ideas into one plan.', 'adjective'],
    ['Egregious', 'Outstandingly bad or shocking.', 'The article contained an egregious factual error.', 'adjective'],
    ['Esoteric', 'Understood by only a small, specialized group.', 'The lecture used esoteric terms from physics.', 'adjective'],
    ['Incongruous', 'Out of place or not in harmony.', 'The formal speech felt incongruous at the casual picnic.', 'adjective'],
    ['Ostensible', 'Appearing or stated to be true, though possibly not.', 'The ostensible reason for the visit was a quick check-in.', 'adjective'],
    ['Perfunctory', 'Done with little care or interest.', 'She offered a perfunctory apology and changed the subject.', 'adjective'],
    ['Pervasive', 'Spreading widely throughout something.', 'A sense of excitement was pervasive across the campus.', 'adjective'],
    ['Salient', 'Most noticeable or important.', 'The most salient point was the cost of the proposal.', 'adjective'],
    ['Tacit', 'Understood without being directly stated.', 'They had a tacit agreement to help each other.', 'adjective'],
    ['Ubiquitous', 'Present or found everywhere.', 'Smartphones are now ubiquitous in daily life.', 'adjective'],
  ],
);

const criticalThinkingAndArguments = makeVocabularyCollectionWords(
  'Critical thinking and arguments',
  [
    ['Axiom', 'A statement accepted as true without proof.', 'The proof began with an axiom of geometry.', 'noun'],
    ['Conjecture', 'A conclusion formed from incomplete information.', 'Her explanation was still a conjecture without evidence.', 'noun'],
    ['Dialectic', 'Reasoned discussion that examines opposing ideas.', 'The class used dialectic to test both sides of the claim.', 'noun'],
    ['Fallacious', 'Based on mistaken reasoning.', 'The argument was fallacious because it ignored the data.', 'adjective'],
    ['Incontrovertible', 'Impossible to deny or dispute.', 'The video provided incontrovertible evidence of the event.', 'adjective'],
    ['Myopic', 'Narrow in view or lacking long-term thinking.', 'A myopic focus on speed created bigger problems later.', 'adjective'],
    ['Specious', 'Seemingly convincing but actually misleading.', 'The advertisement made a specious connection between price and quality.', 'adjective'],
    ['Tenuous', 'Weak, slight, or uncertain.', 'Their connection to the event was tenuous at best.', 'adjective'],
    ['Polemic', 'A strong written or spoken attack on an idea.', 'The essay was a polemic against wasteful spending.', 'noun'],
    ['Presuppose', 'To assume something is true beforehand.', 'That question presupposes that everyone agrees on the goal.', 'verb'],
    ['Reconcile', 'To make ideas compatible or restore harmony.', 'The researcher tried to reconcile the two conflicting results.', 'verb'],
    ['Syllogism', 'A logical argument with two premises and a conclusion.', 'The student identified the flaw in the syllogism.', 'noun'],
  ],
);

const personalityAndBehavior = makeVocabularyCollectionWords(
  'Personality and behavior',
  [
    ['Capricious', 'Changing suddenly and unpredictably.', 'The capricious weather shifted from sun to rain.', 'adjective'],
    ['Diffident', 'Modest or shy because of low confidence.', 'Though diffident, he shared a thoughtful idea.', 'adjective'],
    ['Disingenuous', 'Not candid or sincere.', 'Her disingenuous praise hid a sharp criticism.', 'adjective'],
    ['Fastidious', 'Very careful about details and accuracy.', 'The fastidious editor checked every citation twice.', 'adjective'],
    ['Garrulous', 'Excessively talkative.', 'Our garrulous guide filled the ride with stories.', 'adjective'],
    ['Intransigent', 'Unwilling to change one’s views or agree.', 'The intransigent negotiator rejected every compromise.', 'adjective'],
    ['Magnanimous', 'Generous and forgiving, especially toward a rival.', 'She was magnanimous after winning the close contest.', 'adjective'],
    ['Obsequious', 'Excessively eager to please someone important.', 'The obsequious assistant agreed with every suggestion.', 'adjective'],
    ['Phlegmatic', 'Calm and not easily upset.', 'He remained phlegmatic during the noisy delay.', 'adjective'],
    ['Sanctimonious', 'Pretending to be morally better than others.', 'His sanctimonious speech made the room uncomfortable.', 'adjective'],
    ['Truculent', 'Eager to argue or fight.', 'The truculent customer challenged every policy.', 'adjective'],
    ['Vacillating', 'Unable to decide between different choices.', 'Her vacillating response delayed the final decision.', 'adjective'],
  ],
);

const societyPoliticsAndCulture = makeVocabularyCollectionWords(
  'Society, politics, and culture',
  [
    ['Anachronistic', 'Belonging to a different historical time.', 'A fax machine feels anachronistic in a modern office.', 'adjective'],
    ['Demagogue', 'A leader who gains support by appealing to emotion and prejudice.', 'The demagogue used fear instead of evidence in the speech.', 'noun'],
    ['Hegemony', 'Leadership or dominance over others.', 'The nation maintained economic hegemony in the region.', 'noun'],
    ['Iconoclast', 'A person who challenges widely held beliefs.', 'The iconoclast questioned traditions others accepted without thought.', 'noun'],
    ['Insular', 'Narrow-minded or isolated from outside ideas.', 'The debate became insular when no outside voices were invited.', 'adjective'],
    ['Orthodoxy', 'Accepted beliefs or traditional practices.', 'Her research challenged the scientific orthodoxy.', 'noun'],
    ['Parochial', 'Narrow in outlook or limited to local concerns.', 'The article took a parochial view of a global issue.', 'adjective'],
    ['Populist', 'Appealing to ordinary people, often against an elite.', 'The candidate used a populist message about rising costs.', 'adjective'],
    ['Reactionary', 'Strongly opposed to political or social change.', 'The reactionary proposal would reverse recent reforms.', 'adjective'],
    ['Revisionist', 'Reinterpreting established views of history or policy.', 'The revisionist historian reexamined old records.', 'adjective'],
    ['Zeitgeist', 'The defining spirit or mood of an era.', 'The novel captured the zeitgeist of the early internet.', 'noun'],
    ['Xenophobic', 'Showing fear or dislike of people from other countries.', 'The xenophobic remarks were rejected by the community.', 'adjective'],
  ],
);

const changeProblemsAndConsequences = makeVocabularyCollectionWords(
  'Change, problems, and consequences',
  [
    ['Ameliorate', 'To make a problem or condition better.', 'The new policy may ameliorate the housing shortage.', 'verb'],
    ['Attenuate', 'To reduce the force or severity of something.', 'Trees can attenuate traffic noise near homes.', 'verb'],
    ['Conflagration', 'A large and destructive fire.', 'Firefighters contained the conflagration before dawn.', 'noun'],
    ['Deleterious', 'Harmful, often in a gradual way.', 'Skipping sleep has deleterious effects on focus.', 'adjective'],
    ['Enervate', 'To drain someone of energy or strength.', 'The long heat wave began to enervate the runners.', 'verb'],
    ['Intractable', 'Very difficult to solve or manage.', 'The city faced an intractable traffic problem.', 'adjective'],
    ['Nascent', 'Just beginning to exist or develop.', 'The nascent project needed patient support.', 'adjective'],
    ['Precipitate', 'To cause something to happen suddenly.', 'The discovery could precipitate a major change.', 'verb'],
    ['Proliferate', 'To increase rapidly in number.', 'Unverified rumors can proliferate online.', 'verb'],
    ['Recalcitrant', 'Stubbornly resistant to guidance or control.', 'The recalcitrant machine refused to start again.', 'adjective'],
    ['Tumultuous', 'Full of confusion, noise, or disorder.', 'The company had a tumultuous year of change.', 'adjective'],
    ['Vicissitude', 'An unwelcome change in circumstances or fortune.', 'They endured the vicissitudes of a difficult season.', 'noun'],
  ],
);

const sophisticatedWritingAndDescription = makeVocabularyCollectionWords(
  'Sophisticated writing and description',
  [
    ['Acerbic', 'Sharp and often bitter in tone.', 'The critic wrote an acerbic review of the film.', 'adjective'],
    ['Bombastic', 'Pompous and overly wordy.', 'His bombastic introduction delayed the announcement.', 'adjective'],
    ['Laconic', 'Using very few words.', 'Her laconic reply was simply, “I agree.”', 'adjective'],
    ['Mellifluous', 'Pleasantly smooth and musical in sound.', 'The singer had a mellifluous voice.', 'adjective'],
    ['Pithy', 'Brief but meaningful and forceful.', 'The coach gave a pithy reminder before the game.', 'adjective'],
    ['Prosaic', 'Dull, ordinary, or lacking imagination.', 'The report used prosaic language for an exciting discovery.', 'adjective'],
    ['Sardonic', 'Grimly mocking or cynical.', 'He offered a sardonic smile at the obvious mistake.', 'adjective'],
    ['Trenchant', 'Clear, forceful, and effective.', 'Her trenchant analysis exposed the main weakness.', 'adjective'],
    ['Verbose', 'Using more words than necessary.', 'The verbose email hid its request near the end.', 'adjective'],
    ['Vitriolic', 'Filled with bitter criticism or hatred.', 'The debate turned vitriolic after the accusation.', 'adjective'],
    ['Grandiloquent', 'Pompous in language or style.', 'The grandiloquent speech promised more than it could deliver.', 'adjective'],
    ['Pedantic', 'Overly concerned with minor rules or details.', 'His pedantic correction interrupted the conversation.', 'adjective'],
  ],
);

const difficultButValuable = makeVocabularyCollectionWords(
  'Difficult but highly valuable words',
  [
    ['Antithetical', 'Directly opposed or contrasted.', 'Her values were antithetical to his approach.', 'adjective'],
    ['Circumspect', 'Careful to consider risks before acting.', 'Be circumspect before sharing private information.', 'adjective'],
    ['Equivocate', 'To use ambiguous language to avoid a clear answer.', 'The witness tried to equivocate when asked directly.', 'verb'],
    ['Extant', 'Still existing; not lost or destroyed.', 'Only two extant copies of the letter remain.', 'adjective'],
    ['Impecunious', 'Having little or no money.', 'The impecunious student found a free workshop.', 'adjective'],
    ['Impetuous', 'Acting quickly without enough thought.', 'His impetuous decision created extra work.', 'adjective'],
    ['Ineffable', 'Too great or beautiful to describe in words.', 'The view from the summit felt ineffable.', 'adjective'],
    ['Inimical', 'Harmful or hostile to something.', 'The harsh conditions were inimical to plant growth.', 'adjective'],
    ['Inveterate', 'Long established and unlikely to change.', 'He was an inveterate note-taker in every meeting.', 'adjective'],
    ['Parsimonious', 'Extremely unwilling to spend money or use resources.', 'The parsimonious manager avoided even small expenses.', 'adjective'],
    ['Quixotic', 'Idealistic but impractical.', 'Their quixotic plan ignored the budget entirely.', 'adjective'],
    ['Sanguine', 'Optimistic, especially in a difficult situation.', 'She remained sanguine despite the delay.', 'adjective'],
  ],
);

const expertLevelVocabulary = makeVocabularyCollectionWords(
  'Expert-level vocabulary',
  [
    ['Apocryphal', 'Of doubtful truth or authenticity.', 'The famous story may be apocryphal.', 'adjective'],
    ['Contumacious', 'Stubbornly disobedient toward authority.', 'The contumacious official ignored the court order.', 'adjective'],
    ['Ephemeral', 'Lasting for a very short time.', 'The rainbow was an ephemeral burst of color.', 'adjective'],
    ['Exculpate', 'To clear someone from blame.', 'The records helped exculpate the accused employee.', 'verb'],
    ['Inchoate', 'Not fully formed, organized, or developed.', 'The team had an inchoate idea but no final plan.', 'adjective'],
    ['Mendacious', 'Dishonest or untruthful.', 'The report was dismissed as mendacious propaganda.', 'adjective'],
    ['Obfuscate', 'To make something unclear or confusing.', 'The jargon seemed designed to obfuscate the issue.', 'verb'],
    ['Opprobrium', 'Harsh public criticism or disgrace.', 'The decision brought opprobrium from many voters.', 'noun'],
    ['Pernicious', 'Having a very harmful effect, often gradual.', 'The pernicious rumor damaged trust over time.', 'adjective'],
    ['Recondite', 'Little known and difficult to understand.', 'The lecture explored a recondite branch of philosophy.', 'adjective'],
    ['Surreptitious', 'Done secretly to avoid being noticed.', 'He took a surreptitious look at the answer key.', 'adjective'],
    ['Tergiversate', 'To avoid a clear position through evasive changes of statement.', 'The spokesperson began to tergiversate under questioning.', 'verb'],
  ],
);

export const WORDWIZ_STARTER_COLLECTIONS: WordWizStarterCollection[] = [
  {
    id: 'commonly-confused',
    title: 'Commonly confused words',
    subtitle: 'Start here · 42 words across 20 pairs and trios',
    description: 'Learn the small differences between words that are easy to mix up in writing and conversation.',
    icon: 'git-compare-outline',
    color: 'orange',
    words: commonlyConfused,
  },
  {
    id: 'polished-vocabulary',
    title: 'Polished vocabulary',
    subtitle: 'Foundation · 20 words for clearer communication',
    description: 'Thoughtful words for expressing ideas with clarity, confidence, and precision.',
    icon: 'sparkles',
    color: 'purple',
    words: polishedVocabulary,
  },
  {
    id: 'advanced-everyday-intelligence',
    title: 'Advanced everyday intelligence',
    subtitle: 'Level 1 · 12 high-value everyday words',
    description: 'Build precise vocabulary for reading, conversation, and clear thinking.',
    icon: 'sparkles',
    color: 'purple',
    words: advancedEverydayIntelligence,
  },
  {
    id: 'critical-thinking-and-arguments',
    title: 'Critical thinking and arguments',
    subtitle: 'Level 2 · 12 reasoning words',
    description: 'Analyze claims, evidence, and arguments with more precision.',
    icon: 'git-compare-outline',
    color: 'orange',
    words: criticalThinkingAndArguments,
  },
  {
    id: 'personality-and-behavior',
    title: 'Personality and behavior',
    subtitle: 'Level 3 · 12 character words',
    description: 'Describe patterns of behavior, temperament, and motivation accurately.',
    icon: 'sparkles',
    color: 'purple',
    words: personalityAndBehavior,
  },
  {
    id: 'society-politics-and-culture',
    title: 'Society, politics, and culture',
    subtitle: 'Level 4 · 12 context words',
    description: 'Read social, political, and cultural conversations with sharper context.',
    icon: 'git-compare-outline',
    color: 'orange',
    words: societyPoliticsAndCulture,
  },
  {
    id: 'change-problems-and-consequences',
    title: 'Change, problems, and consequences',
    subtitle: 'Level 5 · 12 analytical words',
    description: 'Talk clearly about change, difficulty, cause, and impact.',
    icon: 'sparkles',
    color: 'purple',
    words: changeProblemsAndConsequences,
  },
  {
    id: 'sophisticated-writing-and-description',
    title: 'Sophisticated writing and description',
    subtitle: 'Level 6 · 12 style words',
    description: 'Make writing and literary analysis more precise and expressive.',
    icon: 'git-compare-outline',
    color: 'orange',
    words: sophisticatedWritingAndDescription,
  },
  {
    id: 'difficult-but-valuable',
    title: 'Difficult but highly valuable words',
    subtitle: 'Level 7 · 12 advanced words',
    description: 'Tackle demanding vocabulary that pays off across serious reading and writing.',
    icon: 'sparkles',
    color: 'purple',
    words: difficultButValuable,
  },
  {
    id: 'expert-level-vocabulary',
    title: 'Expert-level vocabulary',
    subtitle: 'Level 8 · 12 expert words',
    description: 'A final challenge for nuanced academic and professional language.',
    icon: 'git-compare-outline',
    color: 'orange',
    words: expertLevelVocabulary,
  },
];
