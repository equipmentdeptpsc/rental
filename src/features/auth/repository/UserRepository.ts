import type { User } from "../domain/user";

export interface UserRepository {
  getUsers(): readonly User[];
  getUserById(id: string): User | undefined;
  getUserByUsername(username: string): User | undefined;
  createUser(user: User): User;
  updateUser(user: User): User;
  activateUser(id: string): User;
  deactivateUser(id: string): User;
}
