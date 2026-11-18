// What a switch also covers since a later app release, where the server's FEATURE_DESCRIPTIONS
// text (shown above each switch) doesn't say it yet. Panel copy only; the API owns the behaviour.

export const FEATURE_NOTES: Partial<Record<string, string>> = {
  // v2.5.0 round 2: POST ai/dishes "Needs the aiCreate switch".
  aiCreate:
    'Since app v2.5.0 it also switches AI dishes (Cook together recipes, POST ai/dishes). Making a dish counts toward no limit.',
  // v2.5.0 round 2: THIRD_EAR_FAIR_USE_DAILY, default 50, a server setting.
  thirdEar:
    'Plus daily cap: 50 messages a day, set on the server (THIRD_EAR_FAIR_USE_DAILY), not here. Past it Third Ear pauses until midnight ("Back at midnight"); vent and crisis never pause.',
};

/** The server's description of a switch plus the panel's note, if any. */
export const featureDescription = (key: string, description: string) =>
  FEATURE_NOTES[key] ? `${description} ${FEATURE_NOTES[key]}` : description;
