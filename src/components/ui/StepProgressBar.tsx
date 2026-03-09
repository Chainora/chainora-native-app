import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSettings } from '../../features/settings';
import type { ThemeTokens } from '../../types/theme/colors';

type StepProgressBarProps = {
  currentStep: number;
  totalSteps: number;
};

export const StepProgressBar: React.FC<StepProgressBarProps> = ({
  currentStep,
  totalSteps,
}) => {
  const { themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const steps = Array.from({ length: totalSteps }, (_, index) => index + 1);

  return (
    <View style={styles.container}>
      {steps.map((stepNumber) => {
        const isFilled = stepNumber <= currentStep;
        return (
          <View
            key={stepNumber}
            style={[
              styles.segment,
              isFilled && styles.segmentFilled,
            ]}
          />
        );
      })}
    </View>
  );
};

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 20,
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.surface,
  },
  segmentFilled: {
    backgroundColor: theme.primary,
  },
});
