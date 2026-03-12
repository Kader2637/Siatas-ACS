import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { router, useFocusEffect } from 'expo-router';

export default function ChatMainScreen() {
    const [activeSubTab, setActiveSubTab] = useState('user'); // 'user' atau 'diskusi'
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    // 1. AUTO-FETCH SETIAP KALI TAB DIBUKA
    useFocusEffect(
        useCallback(() => {
            fetchInitialData();
        }, [activeSubTab]) // Re-fetch jika pindah sub-tab
    );

    async function fetchInitialData() {
        if (!refreshing) setLoading(true);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUser(user);
            // Ambil data User & Grup secara paralel
            await Promise.all([fetchUsers(user.id), fetchGroups(user.id)]);
        }
        setLoading(false);
        setRefreshing(false);
    }

    async function fetchUsers(myId) {
        // Mengambil semua user terdaftar untuk dijadikan kontak
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', myId); // Kecuali diri sendiri
        
        if (!error && data) {
            setUsers(data);
        }
    }

    async function fetchGroups(myId) {
        // Mengambil Laga di mana user terdaftar sebagai member
        const { data, error } = await supabase
            .from('competition_members')
            .select('competition_id, competitions(id, title, image_url)')
            .eq('user_id', myId);
        
        if (!error && data) {
            const formattedGroups = data.map(item => item.competitions);
            setGroups(formattedGroups);
        }
    }

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchInitialData();
    }, []);

    const renderUserItem = ({ item }) => (
        <TouchableOpacity 
            style={styles.chatCard}
            onPress={() => router.push({ 
                pathname: '/chat_room', 
                params: { targetId: item.id, targetName: item.full_name, type: 'private' } 
            })}
        >
            <Image 
                source={{ uri: item.avatar_url || 'https://i.pravatar.cc/150' }} 
                style={styles.avatar} 
            />
            <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{item.full_name}</Text>
                <Text style={styles.chatLastMsg} numberOfLines={1}>
                    Klik untuk kirim instruksi pribadi...
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>
    );

    const renderGroupItem = ({ item }) => (
        <TouchableOpacity 
            style={styles.chatCard}
            onPress={() => router.push({ 
                pathname: '/chat_room', 
                params: { targetId: item.id, targetName: item.title, type: 'group' } 
            })}
        >
            <View style={styles.groupIconBg}>
                <Image 
                    source={{ uri: item.image_url || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80' }} 
                    style={styles.groupImage} 
                />
            </View>
            <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{item.title}</Text>
                <Text style={styles.chatLastMsg} numberOfLines={1}>Diskusi Strategi Tim Laga</Text>
            </View>
            <View style={styles.badgeGrup}><Text style={styles.badgeGrupText}>GRUP</Text></View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* SUB-TAB SELECTOR (USER VS DISKUSI) */}
            <View style={styles.tabWrapper}>
                <TouchableOpacity 
                    style={[styles.subTab, activeSubTab === 'user' && styles.subTabActive]} 
                    onPress={() => setActiveSubTab('user')}
                >
                    <Ionicons name="person" size={18} color={activeSubTab === 'user' ? '#FFF' : '#94A3B8'} />
                    <Text style={[styles.subTabText, activeSubTab === 'user' && styles.subTabTextActive]}>User</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.subTab, activeSubTab === 'diskusi' && styles.subTabActive]} 
                    onPress={() => setActiveSubTab('diskusi')}
                >
                    <Ionicons name="megaphone" size={18} color={activeSubTab === 'diskusi' ? '#FFF' : '#94A3B8'} />
                    <Text style={[styles.subTabText, activeSubTab === 'diskusi' && styles.subTabTextActive]}>Diskusi</Text>
                </TouchableOpacity>
            </View>

            {loading && !refreshing ? (
                <View style={styles.centerLoading}>
                    <ActivityIndicator size="large" color="#6366F1" />
                    <Text style={styles.loadingText}>Mencari Strategist...</Text>
                </View>
            ) : (
                <FlatList
                    data={activeSubTab === 'user' ? users : groups}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={activeSubTab === 'user' ? renderUserItem : renderGroupItem}
                    contentContainerStyle={styles.listArea}
                    refreshControl={
                        <RefreshControl 
                            refreshing={refreshing} 
                            onRefresh={onRefresh} 
                            colors={['#6366F1']} 
                            tintColor="#6366F1"
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <View style={styles.emptyIconBg}>
                                <Ionicons 
                                    name={activeSubTab === 'user' ? "people-outline" : "chatbubbles-outline"} 
                                    size={40} 
                                    color="#6366F1" 
                                />
                            </View>
                            <Text style={styles.emptyTitle}>
                                {activeSubTab === 'user' ? 'Tidak ada user lain' : 'Belum ada grup'}
                            </Text>
                            <Text style={styles.emptyDesc}>
                                {activeSubTab === 'user' 
                                    ? 'Ajak rekan tim Anda untuk mendaftar di SIASAT ACS.' 
                                    : 'Masuklah ke salah satu Laga untuk mulai berdiskusi.'}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 10, color: '#64748B', fontWeight: '700', fontSize: 12 },
    
    tabWrapper: { flexDirection: 'row', backgroundColor: '#FFF', margin: 20, borderRadius: 18, padding: 6, elevation: 8, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 },
    subTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, gap: 8 },
    subTabActive: { backgroundColor: '#6366F1' },
    subTabText: { fontSize: 13, fontWeight: '800', color: '#94A3B8' },
    subTabTextActive: { color: '#FFF' },

    listArea: { paddingHorizontal: 20, paddingBottom: 100 },
    chatCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 22, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05 },
    avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#E2E8F0' },
    groupIconBg: { width: 52, height: 52, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0F172A' },
    groupImage: { width: '100%', height: '100%', opacity: 0.8 },
    chatInfo: { flex: 1, marginLeft: 15 },
    chatName: { fontSize: 16, fontWeight: '900', color: '#1E293B', marginBottom: 4 },
    chatLastMsg: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
    badgeGrup: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    badgeGrupText: { color: '#6366F1', fontSize: 9, fontWeight: '900' },

    emptyBox: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyIconBg: { width: 80, height: 80, borderRadius: 30, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
    emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 10, lineHeight: 20 }
});