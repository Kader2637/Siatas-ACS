import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Image, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../supabase';

// Tahan native splash screen
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const fadeAnim = useState(new Animated.Value(1))[0]; 

  useEffect(() => {
    async function prepare() {
      try {
        // 1. KUNCI UTAMA: Timer minimal 2 detik
        const minimumDisplayTime = new Promise(resolve => setTimeout(resolve, 2000));
        
        // 2. Cek sesi login Supabase
        const authCheck = supabase.auth.getSession();

        // 3. Tunggu keduanya (Siapa yang paling lama, itu yang ditunggu)
        const [sessionResult] = await Promise.all([authCheck, minimumDisplayTime]);
        const session = sessionResult.data.session;

        // Navigasi dilakukan di balik layar splash manual
        if (session) {
          router.replace('/(tabs)/dashboard');
        } else {
          router.replace('/');
        }
      } catch (e) {
        console.warn(e);
      } finally {
        // Lepas native splash screen
        await SplashScreen.hideAsync();
        
        // Animasi fade out layer manual biar transisinya halus (0.6 detik)
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }).start(() => {
          setAppIsReady(true);
          setShowCustomSplash(false);
        });
      }
    }

    prepare();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Stack tetap di-render di background */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="detail" options={{ headerShown: true, title: 'Detail Siasat' }} />
      </Stack>

      {/* Layer Splash Screen Manual (Versi Light) */}
      {showCustomSplash && (
        <Animated.View style={[styles.manualSplash, { opacity: fadeAnim }]}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/images/splash-icon.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>SIASAT <Text style={styles.brandSub}>ACS</Text></Text>
          </View>
          
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="small" color="#6366F1" />
            <Text style={styles.loadingInfo}>Inisiasi Project Strategis...</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  manualSplash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC', // Background Light
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999, // Harus paling tinggi
  },
  logoContainer: { alignItems: 'center' },
  logo: { width: 180, height: 180, marginBottom: 20 },
  brandText: { fontSize: 28, fontWeight: '900', color: '#0F172A', letterSpacing: 2 },
  brandSub: { color: '#6366F1' },
  loaderContainer: { position: 'absolute', bottom: 60, alignItems: 'center' },
  loadingInfo: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase'
  }
});