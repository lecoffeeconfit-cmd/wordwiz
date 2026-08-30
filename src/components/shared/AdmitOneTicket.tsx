import { Image, StyleSheet, View } from 'react-native';

const ADMIT_ONE_TICKET_ARTWORK = require('../../../assets/admit-one-ticket.png');

export function AdmitOneTicket({ size = 'small' }: { size?: 'small' | 'large' }) {
  const isLarge = size === 'large';

  return (
    <View
      pointerEvents="none"
      style={styles.ticket}
    >
      <Image
        source={ADMIT_ONE_TICKET_ARTWORK}
        resizeMode="contain"
        style={isLarge ? styles.ticketArtworkLarge : styles.ticketArtworkSmall}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketArtworkSmall: {
    width: 26,
    height: 15,
  },
  ticketArtworkLarge: {
    width: 44,
    height: 25,
  },
});
