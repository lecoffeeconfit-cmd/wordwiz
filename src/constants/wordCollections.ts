export type StarterCollectionWord = {
  term: string;
  definition: string;
  example: string;
  partOfSpeech: string;
  group?: string;
};

export type WordWizStarterCollection = {
  id: 'polished-vocabulary' | 'commonly-confused';
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

export const WORDWIZ_STARTER_COLLECTIONS: WordWizStarterCollection[] = [
  {
    id: 'polished-vocabulary',
    title: 'Polished vocabulary',
    subtitle: '20 words for clearer communication',
    description: 'Thoughtful words for expressing ideas with clarity, confidence, and precision.',
    icon: 'sparkles',
    color: 'purple',
    words: polishedVocabulary,
  },
  {
    id: 'commonly-confused',
    title: 'Commonly confused words',
    subtitle: '42 words in 20 useful groups',
    description: 'Learn the small differences between words that are easy to mix up in writing and conversation.',
    icon: 'git-compare-outline',
    color: 'orange',
    words: commonlyConfused,
  },
];
