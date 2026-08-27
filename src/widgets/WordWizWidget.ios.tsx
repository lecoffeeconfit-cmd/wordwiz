import { Button, HStack, Link, ProgressView, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  padding,
  progressViewStyle,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WordWizWidgetSnapshot } from './types';

function WordWizWidgetView(
  props: WordWizWidgetSnapshot,
  environment: WidgetEnvironment,
) {
  'widget';

  const palette = props.style === 'notebook'
    ? {
        background: '#FFFDF8',
        accent: '#B47720',
        value: '#17152D',
        detail: '#6F6A80',
        footer: '#A98D72',
      }
    : props.style === 'meadow'
      ? {
          background: '#174C46',
          accent: '#A7F0D6',
          value: '#FFFFFF',
          detail: '#D3F5E7',
          footer: '#A6D7C7',
        }
      : {
          background: '#25234F',
          accent: '#BDB8FF',
          value: '#FFFFFF',
          detail: '#D0CEE8',
          footer: '#918DB8',
        };
  const isAccessory = environment.widgetFamily === 'accessoryInline' ||
    environment.widgetFamily === 'accessoryCircular' ||
    environment.widgetFamily === 'accessoryRectangular';
  const isLarge = environment.widgetFamily === 'systemLarge';
  const isMedium = environment.widgetFamily === 'systemMedium';
  const word = props.currentWord;
  const wordDestination = word.id ? `wordwiz://review/${word.id}` : 'wordwiz://review';
  const rootDestination = props.widgetType === 'review-word' || props.widgetType === 'daily-challenge'
    ? wordDestination
    : 'wordwiz://home';
  const nextIndex = props.rotationWords.length > 1
    ? (props.rotationIndex + 1) % props.rotationWords.length
    : 0;
  const nextWord = props.rotationWords[nextIndex] ?? word;
  const wordMeta = [word.partOfSpeech, word.pronunciation].filter(Boolean).join(' · ');
  const related = word.synonyms.length > 0
    ? `Synonyms · ${word.synonyms.join(', ')}`
    : word.antonyms.length > 0
      ? `Antonyms · ${word.antonyms.join(', ')}`
      : '';
  const dailyProgress = Math.min(1, Math.max(0, props.activitiesToday / Math.max(1, props.dailyGoal)));
  const retentionProgress = props.retentionHasEvidence
    ? Math.min(1, Math.max(0, props.retentionPercent / 100))
    : 0;

  if (isAccessory) {
    return (
      <Text
        modifiers={[
          font({ weight: 'bold', size: 14, design: 'rounded' }),
          foregroundStyle(palette.value),
          widgetURL(rootDestination),
        ]}
      >
        {props.widgetType === 'streak' ? `🔥 ${props.streakCurrent}d` : word.term}
      </Text>
    );
  }

  if (props.widgetType === 'streak') {
    return (
      <VStack
        spacing={5}
        modifiers={[
          padding({ all: 14 }),
          containerBackground(palette.background, 'widget'),
          widgetURL(rootDestination),
        ]}
      >
        <HStack alignment="center" spacing={8}>
          <Text modifiers={[font({ weight: 'black', size: 11, design: 'rounded' }), foregroundStyle(palette.accent)]}>
            ✦ WORDWIZ
          </Text>
          <Text modifiers={[font({ weight: 'bold', size: 9 }), foregroundStyle(palette.footer)]}>
            STREAK
          </Text>
        </HStack>
        <Text modifiers={[font({ weight: 'black', size: isLarge ? 36 : 29, design: 'rounded' }), foregroundStyle(palette.value)]}>
          🔥 {props.streakCurrent}
        </Text>
        <Text modifiers={[font({ weight: 'semibold', size: 13, design: 'rounded' }), foregroundStyle(palette.detail)]}>
          day learning streak
        </Text>
        <Text modifiers={[font({ weight: 'bold', size: 11 }), foregroundStyle(palette.accent)]}>
          {props.activitiesToday} of {props.dailyGoal} activities today
        </Text>
        <ProgressView
          value={dailyProgress}
          modifiers={[progressViewStyle('linear'), tint(palette.accent)]}
        />
      </VStack>
    );
  }

  if (props.widgetType === 'words-due') {
    return (
      <VStack
        spacing={6}
        modifiers={[
          padding({ all: 14 }),
          containerBackground(palette.background, 'widget'),
          widgetURL(rootDestination),
        ]}
      >
        <HStack alignment="center" spacing={8}>
          <Text modifiers={[font({ weight: 'black', size: 11, design: 'rounded' }), foregroundStyle(palette.accent)]}>
            ✦ WORDWIZ
          </Text>
          <Text modifiers={[font({ weight: 'bold', size: 9 }), foregroundStyle(palette.footer)]}>
            RETENTION
          </Text>
        </HStack>
        <Text modifiers={[font({ weight: 'black', size: isLarge ? 29 : 24, design: 'rounded' }), foregroundStyle(palette.value)]}>
          🧠 {props.dueCount} words ready
        </Text>
        <Text modifiers={[font({ weight: 'semibold', size: 13, design: 'rounded' }), foregroundStyle(palette.detail)]}>
          {props.retentionHasEvidence ? `${props.retentionPercent}% retention` : 'Build retention with spaced reviews'}
        </Text>
        <ProgressView
          value={retentionProgress}
          modifiers={[progressViewStyle('linear'), tint(palette.accent)]}
        />
        <Text modifiers={[font({ size: 11 }), foregroundStyle(palette.detail), lineLimit(2)]}>
          {props.dueCount > 0 ? 'A focused review is waiting.' : 'You’re all caught up.'}
        </Text>
        <Link
          label={props.dueCount > 0 ? 'Review now →' : 'Open WordWiz →'}
          destination={props.dueCount > 0 ? 'wordwiz://review' : 'wordwiz://home'}
          modifiers={[font({ weight: 'bold', size: 10 }), foregroundStyle(palette.accent)]}
        />
      </VStack>
    );
  }

  if (props.widgetType === 'daily-challenge') {
    return (
      <VStack
        spacing={6}
        modifiers={[
          padding({ all: 14 }),
          containerBackground(palette.background, 'widget'),
          widgetURL(wordDestination),
        ]}
      >
        <HStack alignment="center" spacing={8}>
          <Text modifiers={[font({ weight: 'black', size: 11, design: 'rounded' }), foregroundStyle(palette.accent)]}>
            ✦ WORDWIZ
          </Text>
          <Text modifiers={[font({ weight: 'bold', size: 9 }), foregroundStyle(palette.footer)]}>
            DAILY CHALLENGE
          </Text>
        </HStack>
        <Text modifiers={[font({ weight: 'semibold', size: 13, design: 'rounded' }), foregroundStyle(palette.accent), lineLimit(1)]}>
          Can you remember this?
        </Text>
        <Text modifiers={[font({ weight: 'black', size: isLarge ? 30 : 24, design: 'rounded' }), foregroundStyle(palette.value), lineLimit(1)]}>
          {word.term}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(palette.detail), lineLimit(2)]}>
          Definition hidden · bring the meaning back yourself.
        </Text>
        <Link
          label="Tap to review →"
          destination={wordDestination}
          modifiers={[font({ weight: 'bold', size: 11 }), foregroundStyle(palette.accent)]}
        />
      </VStack>
    );
  }

  const isWordReview = props.widgetType === 'review-word';
  const showDetails = isLarge || isMedium;
  const canRotate = isWordReview && props.rotationWords.length > 1 && showDetails;
  const definitionIsDifferent = word.definition.trim() !== word.plainDefinition.trim();

  return (
    <VStack
      spacing={5}
      modifiers={[
        padding({ all: 14 }),
        containerBackground(palette.background, 'widget'),
        widgetURL(rootDestination),
      ]}
    >
      <HStack alignment="center" spacing={8}>
        <Text modifiers={[font({ weight: 'black', size: 11, design: 'rounded' }), foregroundStyle(palette.accent)]}>
          ✦ WORDWIZ
        </Text>
        <Text modifiers={[font({ weight: 'bold', size: 9 }), foregroundStyle(palette.footer)]}>
          {isWordReview ? 'WORD REVIEW' : 'WORD OF THE DAY'}
        </Text>
      </HStack>
      <Text modifiers={[font({ weight: 'black', size: isLarge ? 30 : isMedium ? 25 : 22, design: 'rounded' }), foregroundStyle(palette.value), lineLimit(1)]}>
        {word.term}
      </Text>
      {wordMeta ? (
        <Text modifiers={[font({ weight: 'semibold', size: 10, design: 'rounded' }), foregroundStyle(palette.accent), lineLimit(1)]}>
          {wordMeta}
        </Text>
      ) : null}
      <Text modifiers={[font({ weight: 'semibold', size: 12, design: 'rounded' }), foregroundStyle(palette.detail), lineLimit(showDetails ? 3 : 2)]}>
        {word.plainDefinition}
      </Text>
      {isLarge && definitionIsDifferent ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(palette.detail), lineLimit(3)]}>
          Definition · {word.definition}
        </Text>
      ) : null}
      {showDetails && word.example ? (
        <Text modifiers={[font({ size: 10, design: 'rounded' }), foregroundStyle(palette.footer), lineLimit(isLarge ? 2 : 1)]}>
          “{word.example.replace(/^“|”$/g, '')}”
        </Text>
      ) : null}
      {isLarge && related ? (
        <Text modifiers={[font({ weight: 'semibold', size: 10 }), foregroundStyle(palette.accent), lineLimit(1)]}>
          {related}
        </Text>
      ) : null}
      <HStack alignment="center" spacing={8}>
        {canRotate ? (
          <Button
            label={`Next word · ${nextIndex + 1}/${props.rotationWords.length}`}
            target="next-word"
            onPress={() => ({ ...props, currentWord: nextWord, rotationIndex: nextIndex })}
            modifiers={[
              buttonStyle('borderless'),
              buttonBorderShape('capsule'),
              font({ weight: 'bold', size: 10 }),
              tint(palette.accent),
            ]}
          />
        ) : (
          <Link
            label={isWordReview ? 'Open WordWiz →' : 'Keep learning →'}
            destination={wordDestination}
            modifiers={[font({ weight: 'bold', size: 10 }), foregroundStyle(palette.accent)]}
          />
        )}
        {props.quickAddEnabled && isLarge ? (
          <Link
            label="＋ Quick Add"
            destination="wordwiz://add-word"
            modifiers={[font({ weight: 'bold', size: 10 }), foregroundStyle(palette.footer)]}
          />
        ) : null}
      </HStack>
    </VStack>
  );
}

export const WordWizWidget = createWidget('WordWizWidget', WordWizWidgetView);
export default WordWizWidget;
