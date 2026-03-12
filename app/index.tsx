import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function AuthScreen() {
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [notif, setNotif] = useState({ show: false, message: '', type: 'success' });

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [gender, setGender] = useState('Pria');
    const [imageUri, setImageUri] = useState(null);
    const [imageBase64, setImageBase64] = useState(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.replace('/(tabs)/dashboard');
        });
    }, []);

    const showNotif = (msg, type = 'error') => {
        setNotif({ show: true, message: msg, type });
        setTimeout(() => setNotif({ show: false, message: '', type: 'success' }), 4000);
    };

    async function handleLogin() {
        if (!email || !password) return showNotif('Email dan Sandi wajib diisi!');
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            showNotif(error.message);
        } else {
            showNotif('Login berhasil! Memasuki SIASAT ACS...', 'success');
            setTimeout(() => router.replace('/(tabs)/dashboard'), 1000);
        }
        setLoading(false);
    }

    const pickAvatar = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.3,
            base64: true,
        });
        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
            setImageBase64(result.assets[0].base64);
        }
    };

    async function handleRegister() {
        if (!email || !password || !fullName) return showNotif('Lengkapi semua data penting!');
        setLoading(true);

        // 1. Upload Foto (Jika ada)
        let publicAvatarUrl = null;
        const tempId = Math.random().toString(36).substring(7);

        if (imageBase64) {
            const fileName = `avatar_${tempId}.jpg`;
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, decode(imageBase64), { contentType: 'image/jpeg', upsert: true });

            if (!uploadError) {
                const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
                publicAvatarUrl = publicUrlData.publicUrl;
            }
        }

        // 2. DAFTARKAN USER 
        // Pastikan SQL Trigger "handle_auto_confirm_email" sudah abang RUN di Supabase
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    gender: gender,
                    avatar_url: publicAvatarUrl,
                },
            },
        });

        if (authError) {
            showNotif(authError.message);
            setLoading(false);
            return;
        }

        // 3. SELESAI & ARAHKAN KE LOGIN
        // Kita tidak langsung replace ke dashboard, tapi minta user login manual
        showNotif('Identitas Berhasil Dibuat! Silakan Masuk.', 'success');

        setTimeout(() => {
            setIsLogin(true); // Pindah ke mode Login
            setPassword('');  // Kosongkan sandi buat keamanan
            // Email tidak dikosongkan biar user tinggal isi sandi aja
        }, 2000);

        setLoading(false);
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                {notif.show && (
                    <View style={[styles.notifBanner, { backgroundColor: notif.type === 'error' ? '#FEE2E2' : '#DCFCE7', borderColor: notif.type === 'error' ? '#EF4444' : '#22C55E' }]}>
                        <Text style={{ color: notif.type === 'error' ? '#B91C1C' : '#15803D', fontWeight: '700', fontSize: 13, textAlign: 'center' }}>{notif.message}</Text>
                    </View>
                )}

                <View style={styles.brandingArea}>
                    <Text style={styles.brandTitle}>SIASAT <Text style={styles.brandSub}>ACS</Text></Text>
                    <Text style={styles.brandTagline}>{isLogin ? 'Welcome Back, Strategist' : 'Join The Operation'}</Text>
                </View>

                <View style={styles.formCard}>
                    {!isLogin && (
                        <>
                            <View style={styles.avatarSection}>
                                <TouchableOpacity style={styles.avatarCircle} onPress={pickAvatar}>
                                    {imageUri ? <Image source={{ uri: imageUri }} style={styles.avatarImage} /> : <Text style={styles.avatarPlaceholder}>+ Foto</Text>}
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.inputLabel}>Nama Lengkap</Text>
                            <TextInput style={styles.input} placeholder="Nama Anda" placeholderTextColor="#A1A1AA" value={fullName} onChangeText={setFullName} />
                            <Text style={styles.inputLabel}>Identitas</Text>
                            <View style={styles.genderRow}>
                                <TouchableOpacity style={[styles.genderBtn, gender === 'Pria' && styles.genderBtnActive]} onPress={() => setGender('Pria')}>
                                    <Text style={[styles.genderText, gender === 'Pria' && styles.genderTextActive]}>Pria</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.genderBtn, gender === 'Wanita' && styles.genderBtnActive]} onPress={() => setGender('Wanita')}>
                                    <Text style={[styles.genderText, gender === 'Wanita' && styles.genderTextActive]}>Wanita</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}

                    <Text style={styles.inputLabel}>Email Akses</Text>
                    <TextInput style={styles.input} placeholder="admin@siasat.com" placeholderTextColor="#A1A1AA" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                    <Text style={styles.inputLabel}>Sandi Keamanan</Text>
                    <TextInput style={styles.input} placeholder="Minimal 6 karakter" placeholderTextColor="#A1A1AA" value={password} onChangeText={setPassword} secureTextEntry />

                    <TouchableOpacity style={styles.primaryBtn} onPress={isLogin ? handleLogin : handleRegister} disabled={loading}>
                        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>{isLogin ? 'Masuk SIASAT ACS' : 'Daftarkan Identitas'}</Text>}
                    </TouchableOpacity>
                </View>

                <View style={styles.footerRow}>
                    <Text style={styles.footerText}>{isLogin ? "Belum punya akses?" : "Sudah terdaftar?"}</Text>
                    <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
                        <Text style={styles.toggleText}>{isLogin ? " Ajukan Akses Baru" : " Masuk ke Sistem"}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, backgroundColor: '#FAFAFA', padding: 24, justifyContent: 'center' },
    notifBanner: { position: 'absolute', top: 50, left: 24, right: 24, padding: 15, borderRadius: 12, borderWidth: 1, zIndex: 10, alignItems: 'center', elevation: 5 },
    brandingArea: { alignItems: 'center', marginBottom: 40 },
    brandTitle: { fontSize: 40, fontWeight: '900', color: '#09090B', letterSpacing: 1.5 },
    brandSub: { color: '#2563EB', fontWeight: '300' },
    brandTagline: { color: '#71717A', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, marginTop: 8 },
    formCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 16, elevation: 5, borderWidth: 1, borderColor: '#F4F4F5' },
    inputLabel: { fontSize: 12, fontWeight: '600', color: '#52525B', marginBottom: 6, textTransform: 'uppercase' },
    input: { backgroundColor: '#F4F4F5', color: '#09090B', padding: 16, borderRadius: 12, marginBottom: 16, fontSize: 15, fontWeight: '500' },
    avatarSection: { alignItems: 'center', marginBottom: 20 },
    avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F4F4F5', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#E4E4E7', borderStyle: 'dashed', overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarPlaceholder: { color: '#A1A1AA', fontSize: 12, fontWeight: 'bold' },
    genderRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    genderBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7', alignItems: 'center', backgroundColor: '#FAFAFA' },
    genderBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
    genderText: { color: '#71717A', fontWeight: '600' },
    genderTextActive: { color: '#2563EB', fontWeight: '700' },
    primaryBtn: { backgroundColor: '#09090B', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10, elevation: 4 },
    btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
    footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
    footerText: { color: '#71717A', fontSize: 14 },
    toggleText: { color: '#2563EB', fontSize: 14, fontWeight: '700' }
});