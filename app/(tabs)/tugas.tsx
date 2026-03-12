import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TugasScreen() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [filter, setFilter] = useState('mine'); // 'mine', 'all', 'soon', 'late'

    const insets = useSafeAreaInsets();

    useEffect(() => {
        fetchInitialData();
    }, [filter]);

    async function fetchInitialData() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUser(user);
            fetchTasks(user.id);
        }
    }

    async function fetchTasks(userId) {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];

        let query = supabase
            .from('tasks')
            .select('*, competitions(title, image_url)')
            .order('end_date', { ascending: true });

        // LOGIKA FILTER
        if (filter === 'mine') {
            query = query.eq('assigned_to', userId);
        } else if (filter === 'soon') {
            // Deadline dalam 3 hari ke depan & belum kelar
            const limit = new Date();
            limit.setDate(limit.getDate() + 3);
            const limitDate = limit.toISOString().split('T')[0];
            query = query.gte('end_date', today).lte('end_date', limitDate).neq('status', 'done');
        } else if (filter === 'late') {
            // Lewat tanggal hari ini & belum kelar
            query = query.lt('end_date', today).neq('status', 'done');
        }

        const { data, error } = await query;
        if (!error) setTasks(data);
        setLoading(false);
    }

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (currentUser) await fetchTasks(currentUser.id);
        setRefreshing(false);
    }, [currentUser, filter]);

    const getDaysLeft = (dateString) => {
        if (!dateString) return null;
        const diff = new Date(dateString).getTime() - new Date().getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    const toggleStatus = async (task) => {
        const newStatus = task.status === 'done' ? 'todo' : 'done';
        const { error } = await supabase
            .from('tasks')
            .update({ status: newStatus })
            .eq('id', task.id);

        if (!error) fetchTasks(currentUser.id);
    };

    const renderItem = ({ item }) => {
        const daysLeft = getDaysLeft(item.end_date);
        const isDone = item.status === 'done';

        return (
            <TouchableOpacity
                style={[styles.taskCard, isDone && styles.taskDone]}
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: '/detail', params: { compId: item.competition_id, compTitle: item.competitions?.title } })}
            >
                <View style={styles.cardHeader}>
                    <View style={styles.lagaTag}>
                        <Ionicons name="trophy-outline" size={12} color="#6366F1" />
                        <Text style={styles.lagaName} numberOfLines={1}>{item.competitions?.title}</Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleStatus(item)}>
                        <Ionicons
                            name={isDone ? "checkbox" : "square-outline"}
                            size={26}
                            color={isDone ? "#10B981" : "#CBD5E1"}
                        />
                    </TouchableOpacity>
                </View>

                <Text style={[styles.taskTitle, isDone && styles.textStrike]}>{item.title}</Text>

                <View style={styles.cardFooter}>
                    <View style={styles.deadlineBox}>
                        <Ionicons name="calendar-outline" size={14} color={daysLeft <= 0 && !isDone ? "#EF4444" : "#64748B"} />
                        <Text style={[styles.deadlineText, daysLeft <= 0 && !isDone && { color: '#EF4444' }]}>
                            {item.end_date ? item.end_date : 'No Deadline'}
                        </Text>
                    </View>

                    {!isDone && daysLeft !== null && (
                        <View style={[styles.daysBadge, { backgroundColor: daysLeft <= 1 ? '#FEF2F2' : '#EEF2FF' }]}>
                            <Text style={[styles.daysText, { color: daysLeft <= 1 ? '#EF4444' : '#6366F1' }]}>
                                {daysLeft > 0 ? `${daysLeft} Hari Lagi` : (daysLeft === 0 ? 'Hari Ini' : 'Terlambat')}
                            </Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* HEADER TANPA ICON CEKLIS */}
            <View style={styles.header}>
                <Text style={styles.pageTitle}>Daftar Tugas</Text>
                
                {/* FILTER ROW MENGGUNAKAN SCROLLVIEW BIAR GAK SUMPEK */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                    <TouchableOpacity 
                        onPress={() => setFilter('mine')}
                        style={[styles.filterBtn, filter === 'mine' && styles.filterBtnActive]}
                    >
                        <Text style={[styles.filterText, filter === 'mine' && styles.filterTextActive]}>Tugas Saya</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setFilter('all')}
                        style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
                    >
                        <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>Semua</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setFilter('soon')}
                        style={[styles.filterBtn, filter === 'soon' && styles.filterBtnActive]}
                    >
                        <Text style={[styles.filterText, filter === 'soon' && styles.filterTextActive]}>Segera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setFilter('late')}
                        style={[styles.filterBtn, filter === 'late' && styles.filterBtnActive]}
                    >
                        <Text style={[styles.filterText, filter === 'late' && styles.filterTextActive]}>Telat</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {loading && !refreshing ? (
                <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={tasks}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Ionicons name="document-text-outline" size={48} color="#CBD5E1" />
                            <Text style={styles.emptyTitle}>Belum ada tugas</Text>
                            <Text style={styles.emptyDesc}>Filter "{filter}" tidak menemukan data apapun.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0F4F8' },
    
    header: { paddingHorizontal: 24, paddingTop: 25, paddingBottom: 15, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    pageTitle: { fontSize: 26, fontWeight: '900', color: '#0F172A', marginBottom: 15 },
    
    filterScroll: { flexDirection: 'row' },
    filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 10 },
    filterBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
    filterText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
    filterTextActive: { color: '#FFFFFF' },

    listContent: { paddingHorizontal: 24, paddingTop: 20 },

    taskCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 16, elevation: 4, shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 10 },
    taskDone: { opacity: 0.6, backgroundColor: '#F8FAFC', elevation: 0, borderWidth: 1, borderColor: '#E2E8F0' },
    
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    lagaTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 5, maxWidth: '80%' },
    lagaName: { fontSize: 10, fontWeight: '800', color: '#6366F1', textTransform: 'uppercase' },

    taskTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B', marginBottom: 15, lineHeight: 22 },
    textStrike: { textDecorationLine: 'line-through', color: '#94A3B8' },

    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 },
    deadlineBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    deadlineText: { fontSize: 12, fontWeight: '700', color: '#64748B' },

    daysBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    daysText: { fontSize: 10, fontWeight: '900' },

    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 15, marginBottom: 5 },
    emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' }
});