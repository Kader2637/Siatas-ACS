import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

export default function ChatRoom() {
    const insets = useSafeAreaInsets();
    const { targetId, targetName, type } = useLocalSearchParams();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    const [targetProfile, setTargetProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const flatListRef = useRef(null);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUser(user);

            if (type === 'private') {
                const { data: prof } = await supabase.from('profiles').select('avatar_url').eq('id', targetId).single();
                if (prof) setTargetProfile(prof);
            } else {
                const { data: comp } = await supabase.from('competitions').select('image_url').eq('id', targetId).single();
                if (comp) setTargetProfile({ avatar_url: comp.image_url });
            }

            await fetchInitialMessages(user.id);
            markMessagesAsRead(user.id);

            const channel = supabase.channel(`room_${targetId}`)
                .on('postgres_changes', {
                    event: 'INSERT', schema: 'public', table: 'messages'
                }, async (payload) => {
                    const msg = payload.new;
                    const isRelevant = type === 'private'
                        ? (msg.sender_id === targetId && msg.receiver_id === user.id)
                        : (msg.competition_id === targetId && msg.sender_id !== user.id);

                    if (isRelevant) {
                        const { data: prof } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', msg.sender_id).single();
                        setMessages(prev => [{ ...msg, sender_profile: prof }, ...prev]);
                        markMessagesAsRead(user.id);
                    }
                })
                .subscribe();

            return () => { supabase.removeChannel(channel); };
        };
        init();
    }, [targetId]);

    async function fetchInitialMessages(myId) {
        setLoading(true);
        let query = supabase.from('messages').select('*, sender_profile:profiles!sender_id(full_name, avatar_url)');
        if (type === 'private') {
            query = query.or(`and(sender_id.eq.${myId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${myId})`);
        } else {
            query = query.eq('competition_id', targetId);
        }
        const { data } = await query.order('created_at', { ascending: false }).limit(50);
        if (data) setMessages(data);
        setLoading(false);
    }

    async function sendMessage() {
        if (!newMessage.trim() || !currentUser) return;
        const text = newMessage;
        setNewMessage('');

        const tempId = Date.now().toString();
        const optimisticMsg = {
            id: tempId, content: text, sender_id: currentUser.id,
            created_at: new Date().toISOString(), is_read: false,
            sender_profile: { full_name: 'Anda', avatar_url: null }
        };
        setMessages(prev => [optimisticMsg, ...prev]);

        const { error } = await supabase.from('messages').insert([{
            sender_id: currentUser.id, content: text,
            receiver_id: type === 'private' ? targetId : null,
            competition_id: type === 'group' ? targetId : null
        }]);
        
        if (error) setMessages(prev => prev.filter(m => m.id !== tempId));
    }

    async function markMessagesAsRead(myId) {
        await supabase.from('messages')
            .update({ is_read: true })
            .eq('sender_id', targetId)
            .eq('receiver_id', myId)
            .eq('is_read', false);
    }

    const renderItem = ({ item }) => {
        const isMine = item.sender_id === currentUser?.id;
        const sender = item.sender_profile;

        return (
            <View style={[styles.messageRow, isMine ? styles.myRow : styles.theirRow]}>
                {!isMine && (
                    <Image source={{ uri: sender?.avatar_url || 'https://i.pravatar.cc/150' }} style={styles.miniAvatarChat} />
                )}
                <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
                    {!isMine && type === 'group' && <Text style={styles.senderNameLabel}>{sender?.full_name}</Text>}
                    
                    <View style={styles.messageContentWrapper}>
                        <Text style={[styles.messageText, isMine ? styles.myText : styles.theirText]}>
                            {item.content}
                        </Text>
                        
                        {/* JAM DINAMIS: alignSelf berubah sesuai isMine */}
                        <View style={[styles.timeWrapper, { alignSelf: isMine ? 'flex-end' : 'flex-start' }]}>
                            <Text style={[styles.timeText, isMine ? styles.myTime : styles.theirTime]}>
                                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                            {isMine && (
                                <Ionicons name="checkmark-done" size={13} color={item.is_read ? "#38BDF8" : "rgba(255,255,255,0.5)"} style={{ marginLeft: 3 }} />
                            )}
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={28} color="#0F172A" /></TouchableOpacity>
                <View style={styles.userInfo}>
                    <View style={styles.avatarHeaderWrapper}>
                        {targetProfile?.avatar_url ? (
                            <Image source={{ uri: targetProfile.avatar_url }} style={styles.avatarHeaderImg} />
                        ) : (
                            <View style={[styles.avatarHeaderPlaceholder, type === 'group' && { backgroundColor: '#0F172A' }]}>
                                <Ionicons name={type === 'group' ? "people" : "person"} size={18} color="#FFF" />
                            </View>
                        )}
                    </View>
                    <View>
                        <Text style={styles.headerTitle}>{targetName}</Text>
                        <Text style={styles.headerSub}>{type === 'group' ? 'Grup Laga' : 'Strategist'}</Text>
                    </View>
                </View>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                {loading ? <ActivityIndicator color="#6366F1" size="large" style={{ flex: 1 }} /> : (
                    <FlatList data={messages} keyExtractor={item => item.id.toString()} renderItem={renderItem} inverted showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 15 }} />
                )}
                <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
                    <View style={styles.inputWrapper}>
                        <TextInput style={styles.input} placeholder="Ketik pesan..." value={newMessage} onChangeText={setNewMessage} multiline />
                        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}><Ionicons name="send" size={20} color="#FFF" /></TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', elevation: 3 },
    userInfo: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
    avatarHeaderWrapper: { marginRight: 12 },
    avatarHeaderImg: { width: 38, height: 38, borderRadius: 12 },
    avatarHeaderPlaceholder: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
    headerSub: { fontSize: 11, color: '#94A3B8', fontWeight: '700' },
    
    messageRow: { marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end' },
    myRow: { justifyContent: 'flex-end' },
    theirRow: { justifyContent: 'flex-start' },
    miniAvatarChat: { width: 28, height: 28, borderRadius: 10, marginRight: 6, backgroundColor: '#E2E8F0' },
    
    bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
    myBubble: { backgroundColor: '#6366F1', borderBottomRightRadius: 2 },
    theirBubble: { backgroundColor: '#FFF', borderBottomLeftRadius: 2, elevation: 1 },

    messageContentWrapper: { flexDirection: 'column' },
    messageText: { fontSize: 15, fontWeight: '500', lineHeight: 20 },
    
    // Time Wrapper dasar tanpa alignSelf permanen (karena diatur dynamic di atas)
    timeWrapper: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    
    senderNameLabel: { fontSize: 10, fontWeight: '900', color: '#6366F1', marginBottom: 2, textTransform: 'uppercase' },
    myText: { color: '#FFF' },
    theirText: { color: '#1E293B' },
    timeText: { fontSize: 9, fontWeight: '700' },
    myTime: { color: 'rgba(255,255,255,0.7)' },
    theirTime: { color: '#94A3B8' },

    inputBar: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 25, paddingHorizontal: 15, paddingVertical: 5 },
    input: { flex: 1, fontSize: 15, maxHeight: 100, paddingVertical: 8, color: '#1E293B' },
    sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', marginLeft: 10 }
});