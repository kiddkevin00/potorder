# Pot Order

A one-thumb cooking puzzle for iPhone. The pot orders one ingredient at a time, you tap matching items off the conveyor before they slide away. No ads, no IAP, no signup.

- **Support:** https://kiddkevin00.github.io/potorder/
- **Privacy:** https://kiddkevin00.github.io/potorder/privacy.html

## Notes on inspiration vs originality

The conveyor-and-pot reflex mechanic is a common puzzle pattern. Pot Order is an original implementation under its own name with original color/UI choices and emoji ingredients — no assets, naming, or branding from any other app are reused.

## Stack

Expo SDK 54, React 19.1, RN 0.81, TypeScript. Animated API for conveyor motion (native driver). `expo-haptics`, `expo-keep-awake`, AsyncStorage. No game-engine dependency, no extra sprite or sound libraries.

## Local dev

```sh
npm install
npx expo start --tunnel
```

## App Store checklist

- [done] Bundle id `com.markutilitylabs.potorder`, display name, version — `app.json`
- [done] Privacy + Support URLs (see top)
- [you] Apple Developer, Xcode 17+ or EAS, App Store Connect listing, "Data Not Collected" nutrition labels

## License

MIT — see `LICENSE`.
