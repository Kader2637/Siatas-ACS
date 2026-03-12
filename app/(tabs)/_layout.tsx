import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

// =============================
// GLOBAL HEADER (NAVBAR ATAS)
// =============================
function GlobalHeader() {
  const [profile, setProfile] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function fetchProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        setProfile(data);
      }
    }
    fetchProfile();
  }, []);

  async function handleLogout() {
    setMenuVisible(false);
    await supabase.auth.signOut();
    router.replace('/');
  }

  function goToProfile() {
    setMenuVisible(false);
    router.push('/(tabs)/profile');
  }

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
      <View style={styles.brandContainer}>
        {/* LOGO IMAGE MENGGANTIKAN ICON CUBE */}
        <View style={styles.logoWrapper}>
          <Image 
            source={require('../../assets/images/splash-icon.png')} 
            style={styles.brandLogo} 
            resizeMode="contain" 
          />
        </View>
        <Text style={styles.brandTitle}>
          SIASAT <Text style={styles.brandAccent}>ACS</Text>
        </Text>
      </View>

      <TouchableOpacity onPress={() => setMenuVisible(true)} activeOpacity={0.7}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontWeight: '900', color: '#0F172A', fontSize: 16 }}>
              {profile?.full_name?.charAt(0) || 'U'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.popoverMenu, { top: insets.top + 60 }]}>
                <View style={styles.popoverHeader}>
                  <Text style={styles.popoverName} numberOfLines={1}>{profile?.full_name || 'User'}</Text>
                  <Text style={styles.popoverRole}>Strategist ACS</Text>
                </View>
                <TouchableOpacity style={styles.popoverItem} onPress={goToProfile}>
                  <View style={[styles.popoverIconBg, { backgroundColor: '#E0E7FF' }]}>
                    <Ionicons name="person-outline" size={18} color="#6366F1" />
                  </View>
                  <Text style={styles.popoverItemText}>Profil Saya</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.popoverItem} onPress={handleLogout}>
                  <View style={[styles.popoverIconBg, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                  </View>
                  <Text style={[styles.popoverItemText, { color: '#EF4444' }]}>Keluar (Log Out)</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// =============================
// FLOATING HOME BUTTON (TENGAH)
// =============================
function HomeButton(props) {
  return (
    <TouchableOpacity
      {...props}
      activeOpacity={0.9}
      style={styles.homeButtonContainer}
    >
      <View style={styles.homeButton}>
        <Ionicons name="home" size={28} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
}

// =============================
// TAB LAYOUT (NAVBAR BAWAH)
// =============================
export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        header: () => <GlobalHeader />,
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 25,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -5 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          height: Platform.OS === 'ios' ? 75 + insets.bottom : 75,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : 15,
          paddingTop: 8,
          borderTopLeftRadius: 25,
          borderTopRightRadius: 25,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }
      }}
    >
      <Tabs.Screen
        name="lomba"
        options={{
          title: 'Project',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "rocket" : "rocket-outline"} size={22} color={color} />
          )
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'Diskusi',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={22} color={color} />
          )
        }}
      />

      <Tabs.Screen
        name="dashboard"
        options={{
          title: '',
          tabBarButton: (props) => <HomeButton {...props} />
        }}
      />

      <Tabs.Screen
        name="tugas"
        options={{
          title: 'Tugas',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "list" : "list-outline"} size={22} color={color} />
          )
        }}
      />

      <Tabs.Screen 
        name="profile" 
        options={{ 
          title: 'Profil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
          )
        }} 
      />
    </Tabs>
  );
}

// =============================
// STYLES
// =============================
const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    zIndex: 10
  },
  brandContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoWrapper: { 
    width: 35, 
    height: 35, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  brandLogo: { width: '100%', height: '100%' },
  brandTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', letterSpacing: 1 },
  brandAccent: { color: '#6366F1' },
  avatar: { width: 38, height: 38, borderRadius: 12, borderWidth: 1.5, borderColor: '#F1F5F9' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.2)' },
  popoverMenu: {
    position: 'absolute',
    right: 24,
    width: 210,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 8,
    elevation: 15,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 15
  },
  popoverHeader: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', marginBottom: 8 },
  popoverName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  popoverRole: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  popoverItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12 },
  popoverIconBg: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  popoverItemText: { fontSize: 13, fontWeight: '700', color: '#475569' },

  homeButtonContainer: {
    top: -22,
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    zIndex: 50,
  },
  homeButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 4,
    borderColor: '#FFFFFF'
  }
});