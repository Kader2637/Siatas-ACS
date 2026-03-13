import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../supabase';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [profile, setProfile] = useState({ full_name: '', bio: '', avatar_url: '' });
    const [stats, setStats] = useState({ totalLaga: 0, tugasDone: 0, tugasAktif: 0 });

    useEffect(() => {
        fetchProfile();
    }, []);

    async function fetchProfile() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Fetch Data Profile
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profileData) setProfile(profileData);

        // 2. Fetch Statistik Performa
        const { count: lagaCount } = await supabase.from('competition_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
        const { count: doneCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assigned_to', user.id).eq('status', 'done');
        const { count: todoCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assigned_to', user.id).eq('status', 'todo');

        setStats({
            totalLaga: lagaCount || 0,
            tugasDone: doneCount || 0,
            tugasAktif: todoCount || 0
        });
        setLoading(false);
    }

    // ==========================================
    // FUNGSI PILIH GAMBAR (ANTI-FREEZE APK)
    // ==========================================
    const pickImage = async () => {
        // 1. Minta Izin Galeri (Wajib buat APK)
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (status !== 'granted') {
            Alert.alert('Izin Ditolak', 'Aplikasi butuh akses galeri Bang buat ganti foto.');
            return;
        }

        // 2. Launch Galeri
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false, // <--- UBAH JADI FALSE biar gak macet pas klik "Potong" di APK
            quality: 0.4,
            base64: true,
        });

        if (!result.canceled) {
            // Langsung upload tanpa perlu nunggu layar potong yang error
            uploadAvatar(result.assets[0].base64);
        }
    };

    async function uploadAvatar(base64) {
        setUpdating(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const fileName = `avatar_${user.id}_${Date.now()}.jpg`;

            // Upload ke folder avatars di Supabase Storage
            const { data, error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });

            if (uploadError) throw uploadError;

            // Dapatkan URL publik gambar
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);

            // Update URL ke database profiles
            const { error: dbError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);

            if (dbError) throw dbError;

            setProfile({ ...profile, avatar_url: publicUrl });
            Alert.alert("Mantap", "Foto profil berhasil diperbarui!");
        } catch (error) {
            Alert.alert("Gagal Update", error.message);
        } finally {
            setUpdating(false);
        }
    }

    async function handleUpdateProfile() {
        setUpdating(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('profiles')
            .update({ full_name: profile.full_name, bio: profile.bio })
            .eq('id', user.id);

        if (!error) Alert.alert("Berhasil", "Profil diperbarui!");
        else Alert.alert("Gagal", error.message);
        setUpdating(false);
    }

    async function handleLogout() {
        Alert.alert("Keluar", "Yakin ingin mengakhiri sesi strategi ini?", [
            { text: "Batal", style: "cancel" },
            {
                text: "Keluar", style: "destructive", onPress: async () => {
                    await supabase.auth.signOut();
                    router.replace('/');
                }
            }
        ]);
    }

    if (loading) return <View style={styles.loadingCentet}><ActivityIndicator size="large" color="#6366F1" /></View>;

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
            {/* HEADER DESIGN */}
            <View style={styles.profileHeader}>
                <View style={styles.avatarWrapper}>
                    <Image source={{ uri: profile.avatar_url || 'https://i.pravatar.cc/150' }} style={styles.avatarBig} />
                    <TouchableOpacity style={styles.btnEditAvatar} onPress={pickImage} disabled={updating}>
                        {updating ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="camera" size={18} color="#FFF" />}
                    </TouchableOpacity>
                </View>
                <Text style={styles.userName}>{profile.full_name || 'Strategist'}</Text>
                <Text style={styles.userRole}>Tactical Member ACS</Text>
            </View>

            {/* STATS CARDS */}
            <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                    <Text style={styles.statVal}>{stats.totalLaga}</Text>
                    <Text style={styles.statLabel}>Laga</Text>
                </View>
                <View style={[styles.statBox, styles.statBorder]}>
                    <Text style={styles.statVal}>{stats.tugasAktif}</Text>
                    <Text style={styles.statLabel}>Aktif</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={[styles.statVal, { color: '#10B981' }]}>{stats.tugasDone}</Text>
                    <Text style={styles.statLabel}>Selesai</Text>
                </View>
            </View>

            {/* EDIT SECTION */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pengaturan Akun</Text>

                <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Nama Lengkap</Text>
                    <TextInput
                        style={styles.input}
                        value={profile.full_name}
                        onChangeText={(t) => setProfile({ ...profile, full_name: t })}
                    />
                </View>

                <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Bio / Moto</Text>
                    <TextInput
                        style={[styles.input, { height: 80 }]}
                        multiline
                        value={profile.bio}
                        onChangeText={(t) => setProfile({ ...profile, bio: t })}
                        placeholder="Strategi tanpa aksi adalah halusinasi..."
                    />
                </View>

                <TouchableOpacity style={styles.btnSave} onPress={handleUpdateProfile} disabled={updating}>
                    {updating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnSaveText}>Simpan Perubahan</Text>}
                </TouchableOpacity>
            </View>

            {/* SETTINGS LIST */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sistem</Text>

                <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                    <View style={[styles.menuIcon, { backgroundColor: '#FEF2F2' }]}>
                        <Ionicons name="log-out" size={20} color="#EF4444" />
                    </View>
                    <Text style={[styles.menuText, { color: '#EF4444' }]}>Keluar (Sign Out)</Text>
                    <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>
            </View>

            <Text style={styles.version}>SIASAT ACS v1.0.4 Platinum Edition</Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingCentet: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    profileHeader: { alignItems: 'center', paddingTop: 40, paddingBottom: 30, backgroundColor: '#FFF', borderBottomLeftRadius: 40, borderBottomRightRadius: 40, elevation: 5, shadowColor: '#000', shadowOpacity: 0.05 },
    avatarWrapper: { marginBottom: 15 },
    avatarBig: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: '#EEF2FF' },
    btnEditAvatar: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#6366F1', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFF' },
    userName: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
    userRole: { fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },

    statsContainer: { flexDirection: 'row', backgroundColor: '#FFF', marginHorizontal: 25, marginTop: -25, borderRadius: 24, padding: 20, elevation: 10, shadowColor: '#6366F1', shadowOpacity: 0.1, shadowRadius: 15 },
    statBox: { flex: 1, alignItems: 'center' },
    statBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#F1F5F9' },
    statVal: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
    statLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', marginTop: 4, textTransform: 'uppercase' },

    section: { paddingHorizontal: 25, marginTop: 35 },
    sectionTitle: { fontSize: 12, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 15, paddingLeft: 5 },
    inputCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#F1F5F9' },
    inputLabel: { fontSize: 11, fontWeight: '800', color: '#6366F1', marginBottom: 8, textTransform: 'uppercase' },
    input: { fontSize: 15, fontWeight: '600', color: '#0F172A' },

    btnSave: { backgroundColor: '#6366F1', padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 10, elevation: 5, shadowColor: '#6366F1', shadowOpacity: 0.3 },
    btnSaveText: { color: '#FFF', fontWeight: '900', fontSize: 15 },

    menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: '#F1F5F9' },
    menuIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    menuText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#334155' },

    version: { textAlign: 'center', color: '#CBD5E1', fontSize: 10, fontWeight: '700', marginTop: 30, textTransform: 'uppercase', letterSpacing: 1 }
});