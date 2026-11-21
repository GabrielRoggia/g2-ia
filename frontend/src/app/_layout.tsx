import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Shell } from "../components/Shell";
import { AppProvider, useTheme } from "../lib/store";
import { palette } from "../lib/theme";

function Themed() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Shell>
        <Slot />
      </Shell>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });
  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f1115" }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Themed />
      </AppProvider>
    </SafeAreaProvider>
  );
}
